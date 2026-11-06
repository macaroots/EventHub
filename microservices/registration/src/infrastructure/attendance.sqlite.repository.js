import { SqliteRepository } from "../../../shared/infrastructure/sqlite.repository.js";
import { Attendance } from "../domain/attendance.js";

// Presenças. registrationId UNIQUE: o banco garante que não há presença duplicada (RF09).
export class AttendanceSqliteRepository extends SqliteRepository {
    constructor(db) {
        super(db, 'attendances');
        db.exec(`
            CREATE TABLE IF NOT EXISTS ${this.tableName}(
                id TEXT PRIMARY KEY,
                registrationId TEXT NOT NULL UNIQUE,
                activityId TEXT NOT NULL,
                userId TEXT NOT NULL,
                method TEXT NOT NULL,  -- code | manual
                checkedInBy TEXT,
                checkedInAt TEXT NOT NULL
            ) STRICT;
            CREATE INDEX IF NOT EXISTS attendances_activity ON ${this.tableName}(activityId);
        `);
    }
    fromRow(row) {
        return new Attendance(row);
    }
    // Idempotente: grava se a inscrição ainda não tem presença. Devolve a presença gravada e se foi criada agora.
    addOnce(attendance) {
        const { changes } = this.db.prepare(`INSERT INTO ${this.tableName} (id, registrationId, activityId, userId, method, checkedInBy, checkedInAt)
            VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(registrationId) DO NOTHING`)
            .run(attendance.id, attendance.registrationId, attendance.activityId, attendance.userId, attendance.method, attendance.checkedInBy ?? null, attendance.checkedInAt);
        return { attendance: this.getByRegistration(attendance.registrationId), created: changes > 0 };
    }
    getByRegistration(registrationId) {
        const row = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE registrationId = ?`).get(registrationId);
        return row && this.fromRow(row);
    }
    listByActivity(activityId) {
        return this.db.prepare(`SELECT * FROM ${this.tableName} WHERE activityId = ?`).all(activityId).map(r => this.fromRow(r));
    }
}
