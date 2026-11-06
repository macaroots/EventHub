// Transação no SQLite. Se já houver uma aberta, participa dela (quem abriu faz o COMMIT).
// fn tem de ser síncrona: um await no meio deixaria outras requisições escreverem dentro da transação.
// IMMEDIATE: pega o lock de escrita já no início (sem deadlock entre leitores que viram escritores).
export function transaction(db, fn) {
    if (db.isTransaction) return fn();
    db.exec('BEGIN IMMEDIATE');
    try {
        const result = fn();
        if (result instanceof Promise) throw new Error('transaction: fn must be synchronous');
        db.exec('COMMIT');
        return result;
    } catch (e) {
        db.exec('ROLLBACK');
        throw e;
    }
}
