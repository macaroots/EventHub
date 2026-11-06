// Outbox e inbox no banco do serviço; o broker (RabbitMQ) fica atrás.
// - publish grava a mensagem na tabela outbox, na mesma transação do estado (use transaction()).
//   Um relay envia ao broker depois do COMMIT e apaga a linha só quando o broker confirma.
//   Broker fora do ar: as mensagens esperam no banco. Entrega pelo menos uma vez (pode repetir).
// - Cada mensagem ganha messageId (UUID) e occurredAt. O consumidor guarda o messageId na inbox
//   e ignora repetidas.
import { randomUUID } from 'node:crypto';
import { transaction } from '../infrastructure/transaction.js';

const INBOX_DAYS = 30;

export class OutboxMessageBus {
    #flushing = null;
    #timer;

    constructor(db, broker, { intervalMs = 1000 } = {}) {
        Object.assign(this, { db, broker, intervalMs });
        db.exec(`
            CREATE TABLE IF NOT EXISTS outbox(
                seq INTEGER PRIMARY KEY AUTOINCREMENT, -- ordem de envio
                messageId TEXT NOT NULL UNIQUE,
                message TEXT NOT NULL
            ) STRICT;
            CREATE TABLE IF NOT EXISTS inbox(
                messageId TEXT PRIMARY KEY,
                processedAt TEXT NOT NULL
            ) STRICT;
        `);
        this.inbox = {
            has: (id) => !!db.prepare('SELECT 1 FROM inbox WHERE messageId = ?').get(id),
            add: (id) => db.prepare('INSERT OR IGNORE INTO inbox (messageId, processedAt) VALUES (?, ?)').run(id, new Date().toISOString()),
        };
    }

    // Grava o estado e as mensagens juntos: ou tudo, ou nada.
    transaction(fn) {
        return transaction(this.db, fn);
    }

    // Síncrono: só grava. O envio acontece depois do COMMIT.
    publish(message) {
        const m = { ...message, messageId: randomUUID(), occurredAt: new Date().toISOString() };
        this.db.prepare('INSERT INTO outbox (messageId, message) VALUES (?, ?)').run(m.messageId, JSON.stringify(m));
        setImmediate(() => this.flush());
        return m;
    }
    send(command) {
        return this.publish(command);
    }
    listen(type, fn) {
        this.broker.listen(type, fn);
    }

    // Começa a consumir a fila e a enviar o outbox (o que ficou de antes também).
    async consume(queue) {
        this.db.prepare('DELETE FROM inbox WHERE processedAt < ?').run(new Date(Date.now() - INBOX_DAYS * 86_400_000).toISOString());
        await this.broker.consume(queue, { inbox: this.inbox });
        this.#timer ??= setInterval(() => this.flush(), this.intervalMs);
        this.#timer.unref?.();
        await this.flush();
    }

    // Envia em ordem; para no primeiro erro e tenta de novo no próximo ciclo.
    flush() {
        return this.#flushing ??= this.#send().finally(() => this.#flushing = null);
    }
    pending() {
        return this.db.prepare('SELECT count(*) AS n FROM outbox').get().n;
    }
    close() {
        clearInterval(this.#timer);
    }

    async #send() {
        const next = this.db.prepare('SELECT seq, message FROM outbox ORDER BY seq LIMIT 100');
        const remove = this.db.prepare('DELETE FROM outbox WHERE seq = ?');
        for (let rows = next.all(); rows.length; rows = next.all()) {
            for (const { seq, message } of rows) {
                try {
                    await this.broker.publish(JSON.parse(message));
                } catch (e) {
                    console.error('outbox: envio falhou, tenta de novo depois:', e.message);
                    return;
                }
                remove.run(seq);
            }
        }
    }
}
