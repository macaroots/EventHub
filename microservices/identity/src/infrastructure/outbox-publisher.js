// Infrastructure – Transactional Outbox publisher (RabbitMQ)
// Publishes outbox rows in the background and retries on failure.
import amqp from 'amqplib';
import { pool } from './db.js';
import { config } from '../config.js';
import { logger } from './logger.js';
import { toEnvelope } from './envelope.js';

const EXCHANGE = 'event-hub';
const POLL_INTERVAL_MS = 2000;
const MAX_RETRY = 5;

export class OutboxPublisher {
  #channel = null;
  #timer = null;
  #running = false;

  async connect() {
    for (let attempt = 1; ; attempt++) {
      try {
        const conn = await amqp.connect(config.rabbitmq.url);
        const ch = await conn.createConfirmChannel();
        await ch.assertExchange(EXCHANGE, 'topic', { durable: true });
        this.#channel = ch;
        conn.on('error', (err) => {
          logger.warn({ err: err.message }, 'RabbitMQ connection error – outbox will retry');
          this.#channel = null;
        });
        conn.on('close', () => {
          this.#channel = null;
        });
        logger.info('OutboxPublisher connected to RabbitMQ');
        return;
      } catch (err) {
        if (attempt >= MAX_RETRY) {
          logger.warn({ err: err.message }, 'Could not connect to RabbitMQ – outbox running in degraded mode');
          return;
        }
        await new Promise((ok) => setTimeout(ok, 1000 * attempt));
      }
    }
  }

  start() {
    this.#running = true;
    this.#poll();
  }

  stop() {
    this.#running = false;
    if (this.#timer) clearTimeout(this.#timer);
  }

  #poll() {
    if (!this.#running) return;
    this.#flush()
      .catch((err) => logger.error({ err: err.message }, 'Outbox flush error'))
      .finally(() => {
        this.#timer = setTimeout(() => this.#poll(), POLL_INTERVAL_MS);
      });
  }

  async #flush() {
    if (!this.#channel) {
      // Try to reconnect silently
      await this.connect().catch(() => {});
      if (!this.#channel) return;
    }

    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `SELECT * FROM outbox WHERE published_at IS NULL ORDER BY created_at LIMIT 50`
      );
      for (const row of rows) {
        try {
          const event = toEnvelope(row.payload);
          await new Promise((resolve, reject) => this.#channel.publish(
            EXCHANGE,
            row.routing_key,
            Buffer.from(JSON.stringify(event)),
            { persistent: true, contentType: 'application/json', messageId: event.id, type: event.type, appId: event.source },
            error => error ? reject(error) : resolve()
          ));
          await client.query(
            `UPDATE outbox SET published_at = now() WHERE id = $1`,
            [row.id]
          );
        } catch (err) {
          logger.warn({ err: err.message, outbox_id: row.id }, 'Failed to publish outbox event');
          this.#channel = null;
          break;
        }
      }
    } finally {
      client.release();
    }
  }
}

