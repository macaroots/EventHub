import { SqliteRepository } from "../../../../shared/infrastructure/sqlite.repository.js";
export class EventSqliteRepository extends SqliteRepository {
    constructor(db) {
        super(db, 'events');

        db.exec(`
            CREATE TABLE IF NOT EXISTS ${this.tableName}(
                id TEXT PRIMARY KEY,
                name TEXT
            ) STRICT
        `);
    }
    findByName(name) { return this.list().find((e) => e.name === name); }
}