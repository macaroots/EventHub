import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Abre (ou cria) data/<name>.db no diretório do serviço. No compose, data/ é um volume.
export function openDatabase(name) {
    mkdirSync(resolve('data'), { recursive: true });
    const db = new DatabaseSync(join(resolve('data'), `${name}.db`));
    // Várias conexões/processos: WAL deixa ler durante a escrita; busy_timeout espera o lock em vez de falhar.
    db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    return db;
}
