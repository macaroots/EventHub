import { SqliteRepository } from "../../../shared/infrastructure/sqlite.repository.js";

// Cópia do evento publicado pela secretaria: {id, name, status: published | ended | canceled, organizers}.
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
