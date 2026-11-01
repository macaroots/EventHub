export class SqliteRepository {
  constructor(db, tableName) {
    this.db = db;
    this.tableName = tableName;
  }
  // Conversões objeto <-> linha (ex.: arrays em colunas JSON).
  toRow(bean) { return bean; }
  fromRow(row) { return row; }

  add(bean) {
    const row = this.toRow(bean);
    const keys = Object.keys(row);
    const stmt = this.db.prepare(`INSERT INTO ${this.tableName} (${keys.join(',')}) VALUES (${keys.map(e => '?').join(',')})`);
    return stmt.run(...Object.values(row).map(v => v ?? null));
  }

  update(bean) {
    const { id, ...fields } = this.toRow(bean);
    const keys = Object.keys(fields);
    const stmt = this.db.prepare(`UPDATE ${this.tableName} SET ${keys.map(k => `${k} = ?`).join(',')} WHERE id = ?`);
    return stmt.run(...Object.values(fields).map(v => v ?? null), id);
  }

  getById(id) {
    const row = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`).get(id);
    return row && this.fromRow(row);
  }

  list() {
    return this.db.prepare(`SELECT * FROM ${this.tableName}`).all().map(r => this.fromRow(r));
  }

  delete(id) {
    const result = this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`).run(id);
    return result.changes > 0;
  }
}
