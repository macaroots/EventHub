export class SqliteRepository {
  constructor(db, tableName) {
    this.db = db;
    this.tableName = tableName;
  }
  data2object(data) { return data; }
  add(bean) {
    const keys = Object.keys(bean);
    const values = Object.values(bean);
    const stmt = this.db.prepare(`INSERT INTO ${this.tableName} (${keys.join(',')}) VALUES (${keys.map(e => '?').join(',')})`);
    const result = stmt.run(...values);
    return result;
  }

  update(bean) {
    const { id, ...fields } = bean;
    const keys = Object.keys(fields);
    const stmt = this.db.prepare(`UPDATE ${this.tableName} SET ${keys.map(k => `${k} = ?`).join(',')} WHERE id = ?`);
    return stmt.run(...Object.values(fields), id);
  }

  // Find a record by its ID
  getById(id) {
    const stmt = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`);
    return stmt.get(id);
  }

  // Get all records in the table
  list() {
    const stmt = this.db.prepare(`SELECT * FROM ${this.tableName}`);
    return stmt.all();
  }

  // Delete a record by ID
  delete(id) {
    const stmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`);
    const result = stmt.run(id);
    return result.changes > 0;
  }
}
