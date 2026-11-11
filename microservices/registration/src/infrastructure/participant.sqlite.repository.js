import { SqliteRepository } from "../../../shared/infrastructure/sqlite.repository.js";

// Projeção do User do identity: {id, name}.
export class ParticipantSqliteRepository extends SqliteRepository {
    constructor(db) {
        super(db, 'participants');
        db.exec(`CREATE TABLE IF NOT EXISTS ${this.tableName}(id TEXT PRIMARY KEY, name TEXT) STRICT`);
        // Bancos antigos: a projeção guardava o username; o identity agora publica o nome.
        if (db.prepare(`SELECT 1 FROM pragma_table_info('${this.tableName}') WHERE name = 'username'`).get())
            db.exec(`ALTER TABLE ${this.tableName} RENAME COLUMN username TO name`);
    }
}
