// Cada serviço tem seu próprio banco SQLite (servicos/<servico>/dados/<servico>.db); nenhum lê o banco do outro.
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join, resolve } from "node:path";

// Relativa à pasta de onde o serviço roda (npm start dentro de servicos/<servico>), ou DADOS.
const PASTA = resolve(process.env.DADOS ?? "dados");

export function abrir(servico) {
  mkdirSync(PASTA, { recursive: true });
  const db = new DatabaseSync(join(PASTA, `${servico}.db`));
  db.exec(`
    CREATE TABLE IF NOT EXISTS estado (chave TEXT PRIMARY KEY, valor TEXT);
    CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, evento TEXT); -- eventos a publicar
    CREATE TABLE IF NOT EXISTS inbox (id TEXT PRIMARY KEY);               -- eventos já tratados
  `);

  // Uma transação por vez (HTTP e eventos dividem a mesma conexão).
  let fila = Promise.resolve();
  const transacao = (fn) => {
    const resultado = fila.then(async () => {
      db.exec("BEGIN");
      try {
        const valor = await fn();
        db.exec("COMMIT");
        return valor;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    });
    fila = resultado.catch(() => {});
    return resultado;
  };

  return {
    db,
    transacao,
    // Estado simples guardado como JSON (quantidades, preços...).
    ler: (chave, padrao) => {
      const linha = db.prepare("SELECT valor FROM estado WHERE chave = ?").get(chave);
      return linha ? JSON.parse(linha.valor) : padrao;
    },
    gravar: (chave, valor) =>
      db.prepare("INSERT OR REPLACE INTO estado (chave, valor) VALUES (?, ?)").run(chave, JSON.stringify(valor)),
  };
}
