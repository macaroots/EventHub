import { SqliteRepository } from "../../../shared/infrastructure/sqlite.repository.js";

// Projeções simples de outros contextos: eventos {id, name, status} e participantes {id, username}.
export class EventSqliteRepository extends SqliteRepository {
    constructor(db) {
        super(db, 'events');
        db.exec(`CREATE TABLE IF NOT EXISTS ${this.tableName}(id TEXT PRIMARY KEY, name TEXT, status TEXT) STRICT`);
    }
}
export class ParticipantSqliteRepository extends SqliteRepository {
    constructor(db) {
        super(db, 'participants');
        db.exec(`CREATE TABLE IF NOT EXISTS ${this.tableName}(id TEXT PRIMARY KEY, username TEXT) STRICT`);
    }
}
