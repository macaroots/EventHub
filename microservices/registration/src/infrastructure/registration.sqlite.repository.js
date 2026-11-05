import { SqliteRepository } from "../../../shared/infrastructure/sqlite.repository.js";
import { Registration } from "../domain/activity.js";

// Só leitura para a aplicação: as inscrições são gravadas pela Activity (ActivitySqliteRepository).
export class RegistrationSqliteRepository extends SqliteRepository {
    constructor(db) {
        super(db, 'registrations');
        db.exec(`
            CREATE TABLE IF NOT EXISTS ${this.tableName}(
                id TEXT PRIMARY KEY,
                userId TEXT NOT NULL,
                activityId TEXT NOT NULL,
                status TEXT NOT NULL,
                requirements TEXT NOT NULL, -- JSON: [{id, type, fulfilled, ...}]
                reasons TEXT NOT NULL,      -- JSON: [string]
                payment TEXT,               -- JSON: {id, amount, description, requestedAt, paid}
                createdAt TEXT NOT NULL
            ) STRICT;
            CREATE INDEX IF NOT EXISTS registrations_activity ON ${this.tableName}(activityId);
        `);
    }
    toRow(registration) {
        const { requirements, reasons, payment, ...rest } = registration.toJSON();
        return { ...rest, requirements: JSON.stringify(requirements), reasons: JSON.stringify(reasons), payment: payment && JSON.stringify(payment) };
    }
    fromRow(row) {
        return Registration.restore({ ...row, requirements: JSON.parse(row.requirements), reasons: JSON.parse(row.reasons), payment: JSON.parse(row.payment) });
    }
    listByActivity(activityId) {
        return this.db.prepare(`SELECT * FROM ${this.tableName} WHERE activityId = ?`).all(activityId).map(r => this.fromRow(r));
    }
    // Atividades com reserva aguardando pagamento desde antes de `before`.
    listActivitiesWithOverduePayment(before) {
        return this.db.prepare(`SELECT DISTINCT activityId FROM ${this.tableName}
            WHERE status = 'awaiting_payment' AND json_extract(payment, '$.requestedAt') < ?`)
            .all(before.toISOString()).map(r => r.activityId);
    }
}
