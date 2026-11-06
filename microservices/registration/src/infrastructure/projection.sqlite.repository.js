import { SqliteRepository } from "../../../shared/infrastructure/sqlite.repository.js";

// Projeções simples de outros contextos: eventos publicados {id, name, status: published | canceled, organizers}
// e participantes {id, username}.
export class EventSqliteRepository extends SqliteRepository {
    constructor(db) {
        super(db, 'events');
        db.exec(`CREATE TABLE IF NOT EXISTS ${this.tableName}(id TEXT PRIMARY KEY, name TEXT, status TEXT NOT NULL, organizers TEXT NOT NULL) STRICT`);
    }
    toRow({ organizers = [], ...rest }) {
        return { ...rest, organizers: JSON.stringify(organizers) };
    }
    fromRow(row) {
        return { ...row, organizers: JSON.parse(row.organizers) };
    }
}
export class ParticipantSqliteRepository extends SqliteRepository {
    constructor(db) {
        super(db, 'participants');
        db.exec(`CREATE TABLE IF NOT EXISTS ${this.tableName}(id TEXT PRIMARY KEY, username TEXT) STRICT`);
    }
}
