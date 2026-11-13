import { SqliteRepository } from "../../../shared/infrastructure/sqlite.repository.js";
export class EventSqliteRepository extends SqliteRepository {
    constructor(db) {
        super(db, 'events');

        db.exec(`
            CREATE TABLE IF NOT EXISTS ${this.tableName}(
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                information TEXT,
                location TEXT,
                startDate TEXT,
                endDate TEXT,
                status TEXT NOT NULL,
                cancelReason TEXT,
                createdBy TEXT NOT NULL,
                organizers TEXT NOT NULL -- JSON: [userId]
            ) STRICT
        `);
        const columns = db.prepare(`PRAGMA table_info(${this.tableName})`).all().map(column => column.name);
        if (!columns.includes('location')) db.exec(`ALTER TABLE ${this.tableName} ADD COLUMN location TEXT`);
    }
    toRow(bean) { return { ...bean, organizers: JSON.stringify(bean.organizers) }; }
    fromRow(row) { return { ...row, organizers: JSON.parse(row.organizers) }; }

    getByName(name) {
        const row = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE name = ?`).get(name);
        return row && this.fromRow(row);
    }
    // organizerId ausente = todos (admin).
    search({ name, organizerId, status } = {}) {
        const stmt = this.db.prepare(`
            SELECT * FROM ${this.tableName}
            WHERE (:name IS NULL OR name LIKE '%' || :name || '%')
              AND (:status IS NULL OR status = :status)
              AND (:organizerId IS NULL OR EXISTS (SELECT 1 FROM json_each(organizers) WHERE value = :organizerId))
        `);
        return stmt.all({ name: name ?? null, status: status ?? null, organizerId: organizerId ?? null }).map(r => this.fromRow(r));
    }
}
