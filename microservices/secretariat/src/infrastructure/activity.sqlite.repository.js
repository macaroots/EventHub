import { SqliteRepository } from "../../../shared/infrastructure/sqlite.repository.js";
export class ActivitySqliteRepository extends SqliteRepository {
    constructor(db) {
        super(db, 'activities');

        db.exec(`
            CREATE TABLE IF NOT EXISTS ${this.tableName}(
                id TEXT PRIMARY KEY,
                eventId TEXT NOT NULL REFERENCES events(id),
                name TEXT NOT NULL,
                description TEXT,
                location TEXT,
                startsAt TEXT,
                endsAt TEXT,
                capacity INTEGER NOT NULL,
                rules TEXT NOT NULL -- JSON: [{type: 'payment', amount, description} | {type: 'minimumAge', age}]
            ) STRICT
        `);
    }
    toRow(bean) { return { ...bean, rules: JSON.stringify(bean.rules) }; }
    fromRow(row) { return { ...row, rules: JSON.parse(row.rules) }; }

    listByEvent(eventId) {
        return this.db.prepare(`SELECT * FROM ${this.tableName} WHERE eventId = ?`).all(eventId).map(r => this.fromRow(r));
    }
}
