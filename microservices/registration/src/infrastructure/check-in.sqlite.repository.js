import { SqliteRepository } from "../../../shared/infrastructure/sqlite.repository.js";
import { CheckIn } from "../domain/check-in.js";

// Check-in por atividade: id = activityId.
export class CheckInSqliteRepository extends SqliteRepository {
    constructor(db) {
        super(db, 'checkins');
        db.exec(`CREATE TABLE IF NOT EXISTS ${this.tableName}(
            id TEXT PRIMARY KEY, status TEXT NOT NULL, code TEXT, openedAt TEXT) STRICT`);
    }
    toRow({ id, status, code, openedAt }) {
        return { id, status, code, openedAt };
    }
    fromRow(row) {
        return new CheckIn(row);
    }
}
