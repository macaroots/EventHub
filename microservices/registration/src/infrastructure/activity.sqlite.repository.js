import { SqliteRepository } from "../../../shared/infrastructure/sqlite.repository.js";
import { ConcurrencyError } from "../../../shared/domain/errors.js";
import { Activity } from "../domain/activity.js";
import { SEAT_STATUSES } from "../domain/registration.js";
import { ruleFromConfig } from "../domain/rules/rule-from-config.js";

const seat = `(${SEAT_STATUSES.map(s => `'${s}'`).join(',')})`;

// Aggregate: carrega e salva a Activity junto com suas inscrições, numa transação.
// Lock otimista: a versão lida no getById tem de ser a do banco no update; senão, ConcurrencyError.
export class ActivitySqliteRepository extends SqliteRepository {
    #versions = new WeakMap(); // Activity -> versão carregada (fora do domínio)

    constructor(db, registrationRepository) {
        super(db, 'activities');
        this.registrationRepository = registrationRepository;
        const registrations = registrationRepository.tableName;
        // Última barreira (bug, outra instância): só entra em status que ocupa vaga se houver vaga.
        const guard = `AND (SELECT count(*) FROM ${registrations} WHERE activityId = NEW.activityId AND status IN ${seat})
                >= (SELECT capacity FROM ${this.tableName} WHERE id = NEW.activityId)
            BEGIN SELECT RAISE(ABORT, 'Full occupation'); END`;
        db.exec(`
            CREATE TABLE IF NOT EXISTS ${this.tableName}(
                id TEXT PRIMARY KEY,
                eventId TEXT NOT NULL,
                name TEXT,
                capacity INTEGER NOT NULL,
                price REAL NOT NULL DEFAULT 0,
                rules TEXT NOT NULL, -- JSON: [{type: 'minimumAge', age}]
                version INTEGER NOT NULL DEFAULT 0
            ) STRICT;
            CREATE TRIGGER IF NOT EXISTS registrations_seat_insert BEFORE INSERT ON ${registrations}
                WHEN NEW.status IN ${seat} AND NOT EXISTS (SELECT 1 FROM ${registrations} WHERE id = NEW.id) ${guard};
            CREATE TRIGGER IF NOT EXISTS registrations_seat_update BEFORE UPDATE OF status ON ${registrations}
                WHEN NEW.status IN ${seat} AND OLD.status NOT IN ${seat} ${guard};
        `);
    }
    toRow(activity) {
        const { id, eventId, name, capacity, price } = activity.toJSON();
        return { id, eventId, name, capacity, price, rules: JSON.stringify(activity.getRules()) };
    }
    fromRow({ version, ...row }) {
        const activity = new Activity({
            ...row,
            rules: JSON.parse(row.rules).map(ruleFromConfig),
            registrations: this.registrationRepository.listByActivity(row.id),
        });
        this.#versions.set(activity, version);
        return activity;
    }
    add(activity) {
        this.#transaction(activity, () => super.add(activity));
    }
    update(activity) {
        this.#transaction(activity, () => {
            const { id, ...fields } = this.toRow(activity);
            const keys = Object.keys(fields);
            const { changes } = this.db.prepare(`UPDATE ${this.tableName} SET ${keys.map(k => `${k} = ?`).join(',')}, version = version + 1
                WHERE id = ? AND version = ?`).run(...Object.values(fields).map(v => v ?? null), id, this.#versions.get(activity) ?? 0);
            if (!changes) throw new ConcurrencyError('activity');
        });
    }
    listIdsByEvent(eventId) {
        return this.db.prepare(`SELECT id FROM ${this.tableName} WHERE eventId = ?`).all(eventId).map(r => r.id);
    }
    // IMMEDIATE: pega o lock de escrita já no início (sem deadlock entre leitores que viram escritores).
    #transaction(activity, write) {
        this.db.exec('BEGIN IMMEDIATE');
        try {
            write();
            // Quem libera vaga é gravado antes de quem a ocupa (senão o trigger vê a vaga ainda ocupada).
            const seated = (r) => SEAT_STATUSES.includes(r.status);
            for (const r of [...activity.registrations].sort((a, b) => seated(a) - seated(b))) this.registrationRepository.upsert(r);
            this.db.exec('COMMIT');
        } catch (e) {
            this.db.exec('ROLLBACK');
            throw e;
        }
        this.#versions.set(activity, (this.#versions.get(activity) ?? -1) + 1);
    }
}
