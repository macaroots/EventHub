import { SqliteRepository } from "../../../shared/infrastructure/sqlite.repository.js";
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
    getByName(name) {             
        const stmt = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE name=?`);
        return stmt.get(name);
    }
    findByName(name) {             
        const stmt = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE name like ?`);
        return stmt.all(`%${name}%`);
    }
}