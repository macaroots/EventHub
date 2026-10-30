// Mesma interface do InMemoryMessageBus (ouvir/publicar/enviar), mas os eventos atravessam processos pelo RabbitMQ.
// Os objetos de domínio não percebem a troca.
import amqp from "amqplib";

const EXCHANGE = "loja";

export class RabbitMqMessageBus {
  #listeners = {};

  constructor(channel) {
    this.channel = channel;
  }

  static async connect(url = process.env.RABBITMQ_URL ?? "amqp://localhost") {
    for (let attempt = 1; ; attempt++) {
      try {
        const channel = await (await amqp.connect(url)).createChannel();
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

  publish(event) {
    console.log('EVENT', event);
    this.channel.publish(EXCHANGE, event.type, Buffer.from(JSON.stringify(event)), { persistent: true });
  }

  send(command) {
    return this.publish(command);
  }

  // Cada serviço tem sua fila durável: se ele cair, os eventos esperam por ele.
  async consume(queue) {
    await this.channel.assertQueue(queue, { durable: true });
    for (const type of Object.keys(this.#listeners)) await this.channel.bindQueue(queue, EXCHANGE, type);
    await this.channel.prefetch(1); // um evento por vez, na ordem
    await this.channel.consume(queue, async (message) => {
      const event = JSON.parse(message.content);
      try {
        for (const fn of this.#listeners[event.type] ?? []) await fn(event);
      } catch (e) {
        console.error(`[${queue}] ${event.type} falhou:`, e.message);
      }
      this.channel.ack(message);
    });
  }  

}
