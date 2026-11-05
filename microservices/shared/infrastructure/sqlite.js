import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Abre (ou cria) data/<name>.db no diretório do serviço. No compose, data/ é um volume.
export function openDatabase(name) {
    mkdirSync(resolve('data'), { recursive: true });
    return new DatabaseSync(join(resolve('data'), `${name}.db`));
}
