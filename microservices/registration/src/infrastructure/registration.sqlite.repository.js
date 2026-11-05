import { SqliteRepository } from "../../../shared/infrastructure/sqlite.repository.js";
import { Registration } from "../domain/activity.js";

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
                reasons TEXT NOT NULL       -- JSON: [string]
            ) STRICT;
            CREATE INDEX IF NOT EXISTS registrations_activity ON ${this.tableName}(activityId);
        `);
    }
    toRow(registration) {
        const { requirements, reasons, ...rest } = registration.toJSON();
        return { ...rest, requirements: JSON.stringify(requirements), reasons: JSON.stringify(reasons) };
    }
    fromRow(row) {
        return Registration.restore({ ...row, requirements: JSON.parse(row.requirements), reasons: JSON.parse(row.reasons) });
    }
    listByActivity(activityId) {
        return this.db.prepare(`SELECT * FROM ${this.tableName} WHERE activityId = ?`).all(activityId).map(r => this.fromRow(r));
    }
}
