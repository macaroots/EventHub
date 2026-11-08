import { SqliteRepository } from "../../../shared/infrastructure/sqlite.repository.js";
import { Payment } from "../domain/payment.js";

export class PaymentSqliteRepository extends SqliteRepository {
    constructor(db) {
        super(db, 'payments');
        db.exec(`
            CREATE TABLE IF NOT EXISTS ${this.tableName}(
                id TEXT PRIMARY KEY,
                amount REAL NOT NULL,
                description TEXT,
                registrationId TEXT,
                status TEXT NOT NULL,
                receipt TEXT
            ) STRICT
        `);
    }
    toRow({ id, amount, description, registrationId, status, receipt }) {
        return { id, amount, description, registrationId, status, receipt };
    }
    fromRow(row) { return Payment.restore(row); }
    listByRegistration(registrationId) {
        return this.db.prepare(`SELECT * FROM ${this.tableName} WHERE registrationId = ?`).all(registrationId).map(r => this.fromRow(r));
    }
}
