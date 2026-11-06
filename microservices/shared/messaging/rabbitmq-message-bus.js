// Mesma interface do InMemoryMessageBus (ouvir/publicar/enviar), mas os eventos atravessam processos pelo RabbitMQ.
// Os objetos de domínio não percebem a troca. Nos serviços, fica atrás do OutboxMessageBus.
import amqp from "amqplib";

const EXCHANGE = "loja";
const MAX_ATTEMPTS = Number(process.env.MESSAGE_MAX_ATTEMPTS ?? 5);
const RETRY_DELAY_MS = Number(process.env.MESSAGE_RETRY_DELAY_MS ?? 5000);

export class RabbitMqMessageBus {
  #listeners = {};

  constructor(channel) {
    this.channel = channel;
  }

  static async connect(url = process.env.RABBITMQ_URL ?? "amqp://localhost") {
    for (let attempt = 1; ; attempt++) {
      try {
        // Confirm channel: o broker avisa quando gravou a mensagem (o outbox só apaga depois disso).
        const channel = await (await amqp.connect(url)).createConfirmChannel();
        await channel.assertExchange(EXCHANGE, "topic", { durable: true });
        return new RabbitMqMessageBus(channel);
      } catch (e) {
        if (attempt === 30) throw e;
        await new Promise((ok) => setTimeout(ok, 1000)); // RabbitMQ ainda subindo
      }
    }
  }

  listen(type, fn) {
    (this.#listeners[type] ??= []).push(fn);
  }

  // Resolve quando o broker confirma.
  publish(event) {
    console.log('EVENT', event);
    return new Promise((ok, fail) => this.channel.publish(EXCHANGE, event.type, Buffer.from(JSON.stringify(event)),
      { persistent: true, messageId: event.messageId, type: event.type, contentType: "application/json" },
      (e) => (e ? fail(e) : ok())));
  }

  send(command) {
    return this.publish(command);
  }

  // Cada serviço tem sua fila durável: se ele cair, os eventos esperam por ele.
  // Falha no handler: volta pela <fila>.retry (espera RETRY_DELAY_MS) até MAX_ATTEMPTS; depois vai para a <fila>.dlq.
  // inbox {has, add}: ignora messageId já tratado (entrega repetida).
  async consume(queue, { inbox } = {}) {
    await this.channel.assertQueue(queue, { durable: true });
    await this.channel.assertQueue(`${queue}.retry`, { durable: true, arguments: {
      "x-message-ttl": RETRY_DELAY_MS, "x-dead-letter-exchange": "", "x-dead-letter-routing-key": queue } });
    await this.channel.assertQueue(`${queue}.dlq`, { durable: true });
    for (const type of Object.keys(this.#listeners)) await this.channel.bindQueue(queue, EXCHANGE, type);
    await this.channel.prefetch(1); // um evento por vez, na ordem
    await this.channel.consume(queue, async (message) => {
      try {
        await this.#handle(message, inbox);
      } catch (e) {
        try {
          await this.#reject(queue, message, e);
        } catch {
          return this.channel.nack(message); // nem a retry aceitou: devolve à fila
        }
      }
      this.channel.ack(message);
    });
  }

  async #handle(message, inbox) {
    const event = JSON.parse(message.content);
    const id = event.messageId ?? message.properties.messageId;
    if (id && inbox?.has(id)) return console.log(`[${event.type}] ${id} repetida, ignorada`);
    for (const fn of this.#listeners[event.type] ?? []) await fn(event);
    if (id) inbox?.add(id);
  }

  #reject(queue, message, error) {
    const headers = message.properties.headers ?? {};
    const attempt = Number(headers["x-attempt"] ?? 1);
    const target = attempt < MAX_ATTEMPTS ? `${queue}.retry` : `${queue}.dlq`;
    console.error(`[${queue}] tentativa ${attempt}/${MAX_ATTEMPTS} falhou (→ ${target}):`, error.message);
    return new Promise((ok, fail) => this.channel.sendToQueue(target, message.content,
      { ...message.properties, persistent: true, headers: { ...headers, "x-attempt": attempt + 1, "x-error": error.message } },
      (e) => (e ? fail(e) : ok())));
  }
}
