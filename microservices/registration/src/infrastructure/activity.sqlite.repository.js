import { SqliteRepository } from "../../../shared/infrastructure/sqlite.repository.js";
import { Activity, ruleFromConfig } from "../domain/activity.js";

// Aggregate: carrega e salva a Activity junto com suas inscrições (na mesma transação).
export class ActivitySqliteRepository extends SqliteRepository {
    constructor(db, registrationRepository) {
        super(db, 'activities');
        this.registrationRepository = registrationRepository;
        db.exec(`
            CREATE TABLE IF NOT EXISTS ${this.tableName}(
                id TEXT PRIMARY KEY,
                eventId TEXT NOT NULL,
                name TEXT,
                capacity INTEGER NOT NULL,
                price REAL NOT NULL DEFAULT 0,
                rules TEXT NOT NULL -- JSON: [{type: 'minimumAge', age}]
            ) STRICT
        `);
    }
    toRow(activity) {
        const { id, eventId, name, capacity, price } = activity.toJSON();
        return { id, eventId, name, capacity, price, rules: JSON.stringify(activity.getRules()) };
    }
    fromRow(row) {
        return new Activity({
            ...row,
            rules: JSON.parse(row.rules).map(ruleFromConfig),
            registrations: this.registrationRepository.listByActivity(row.id),
        });
    }
    add(activity) { this.#save(activity); }
    update(activity) { this.#save(activity); }
    delete(id) {
        this.db.prepare(`DELETE FROM ${this.registrationRepository.tableName} WHERE activityId = ?`).run(id);
        return super.delete(id);
    }
    #save(activity) {
        this.db.exec('BEGIN');
        try {
            super.upsert(activity);
            for (const r of activity.registrations) this.registrationRepository.upsert(r);
            this.db.exec('COMMIT');
        } catch (e) {
            this.db.exec('ROLLBACK');
            throw e;
        }
    }
}
