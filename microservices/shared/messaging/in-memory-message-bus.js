// Barramento de eventos: permite um contexto avisar o outro sem conhecê-lo.
export class InMemoryMessageBus {
  #listeners = {};

  // Sem banco: só executa (o OutboxMessageBus grava estado e mensagens na mesma transação).
  transaction(fn) {
    return fn();
  }

  listen(type, fn) {
    (this.#listeners[type] ??= []).push(fn);
  }

  // EVENTO: fato no passado (PedidoConfirmado); quem publica não sabe quem ouve (0, 1 ou vários).
  async publish(event) {
    for (const fn of this.#listeners[event.type] ?? []) await fn(event);
  }

  // COMANDO: pedido no imperativo (ReservarEstoque), com um destinatário só. Usa a mesma via;
  // a diferença é de intenção: quem envia espera que alguém atenda e responda com um event.
  send(command) {
    return this.publish(command);
  }
}
