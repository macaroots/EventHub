import { SqliteRepository } from "../../../shared/infrastructure/sqlite.repository.js";
import { User } from "../domain/user.js";

export class UserSqliteRepository extends SqliteRepository {
    constructor(db) {
        super(db, 'users');
        db.exec(`
            CREATE TABLE IF NOT EXISTS ${this.tableName}(
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                role TEXT NOT NULL
            ) STRICT
        `);
    }
    // toJSON omite a senha; aqui ela precisa ir para o banco.
    toRow({ id, username, password, role }) { return { id, username, password, role }; }
    fromRow({ id, username, password, role }) { return new User(username, password, role, id); }

    getByUsername(username) {
        const row = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE username = ?`).get(username);
        return row && this.fromRow(row);
    }
}
