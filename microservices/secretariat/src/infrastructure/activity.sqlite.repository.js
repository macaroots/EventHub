import { SqliteRepository } from "../../../shared/infrastructure/sqlite.repository.js";
export class ActivitySqliteRepository extends SqliteRepository {
    constructor(db) {
        super(db, 'activities');

        db.exec(`
            CREATE TABLE IF NOT EXISTS ${this.tableName}(
                id TEXT PRIMARY KEY,
                eventId TEXT NOT NULL REFERENCES events(id),
                name TEXT,
                capacity INTEGER,
                price REAL
            ) STRICT
        `);
    }
    listByEvent(eventId) {
        return this.db.prepare(`SELECT * FROM ${this.tableName} WHERE eventId = ?`).all(eventId);
    }
}
