import { SqliteRepository } from "../../../shared/infrastructure/sqlite.repository.js";

// Projeções simples de outros contextos: eventos {id, name, status, organizers} e participantes {id, username}.
export class EventSqliteRepository extends SqliteRepository {
    constructor(db) {
        super(db, 'events');
        db.exec(`CREATE TABLE IF NOT EXISTS ${this.tableName}(id TEXT PRIMARY KEY, name TEXT, status TEXT, organizers TEXT NOT NULL DEFAULT '[]') STRICT`);
        // Bancos criados antes da coluna organizers.
        const columns = db.prepare(`PRAGMA table_info(${this.tableName})`).all().map(c => c.name);
        if (!columns.includes('organizers')) db.exec(`ALTER TABLE ${this.tableName} ADD COLUMN organizers TEXT NOT NULL DEFAULT '[]'`);
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
