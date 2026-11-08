import { SqliteRepository } from "../../../shared/infrastructure/sqlite.repository.js";

// Projeção do User do identity: {id, username}.
export class ParticipantSqliteRepository extends SqliteRepository {
    constructor(db) {
        super(db, 'participants');
        db.exec(`CREATE TABLE IF NOT EXISTS ${this.tableName}(id TEXT PRIMARY KEY, username TEXT) STRICT`);
    }
}
