# Título: Vaga e pagamento como status da inscrição, com garantia de capacidade sob concorrência
Número do ADR: 008
Data: 2026-11-05
Responsável: Renato
Status: Aceito

## Contexto
Na `Registration`, vaga (`wait list`), pagamento (`payment`) e elegibilidade (`age verification`) eram todos pendências (`requirements`). Isso causava três problemas:
- quem caía na fila de espera recebia `PaymentRequested` e podia pagar sem ter vaga;
- ninguém resolvia a pendência `wait list`, então a fila não andava;
- a confirmação por pagamento não passava pela `Activity`, e a capacidade podia ser ultrapassada (por exemplo, capacidade reduzida com inscrições pendentes que depois pagam).

Além disso, a capacidade precisa valer sob forte concorrência, inclusive com mais de uma instância do serviço gravando no mesmo banco.

## Decisão
1. **Vaga e pagamento viram status.** `requirements` ficam só para elegibilidade.

   ```
                ┌─ sem vaga ──> waitlisted ──(vaga liberada)──┐
   register ────┤                                             v
    (regras)    └─ com vaga ──> pending ──(elegível)──> awaiting_payment ──(pago)──> confirmed
                                                         │  (price = 0: direto a confirmed)
                                                         └─(recusado / expirou)──> canceled
   ```

   `pending`, `awaiting_payment` e `confirmed` ocupam vaga, e a soma deles nunca passa de `capacity`. As regras de fila, promoção e expiração estão no [README do registration](../../microservices/registration/README.md#regras-de-inscrição-adr-008).
2. **A `Activity` é a única porta de escrita das inscrições.** O repositório de `Registration` só lê.
3. **Garantia de capacidade em camadas:**
   - domínio: a `Activity` decide a vaga;
   - lock otimista (`activities.version`): em conflito, o app service recarrega e refaz;
   - banco: triggers recusam ocupar vaga sem vaga livre. É a rede de segurança contra bugs e outros caminhos de escrita.
4. **O caixa cancela a cobrança** pendente ao receber `RegistrationCanceled`.

## Justificativa
- Vaga e pagamento são etapas do ciclo de vida, com ordem e efeitos colaterais (cobrança, promoção). Como pendências independentes, essa ordem não existia.
- Reservar a vaga enquanto se espera o pagamento evita o "pagou e ficou sem vaga", que exige estorno. A expiração impede que a vaga fique presa.
- O lock otimista mantém a regra no domínio e funciona igual em SQLite e Postgres. Conflitos só acontecem na mesma atividade.
- O trigger torna a invariante independente do código da aplicação.

## Alternativas Consideradas
- **Manter pagamento e vaga como pendências e ajustar a ordem:** continuaria misturando conceitos, e a cobrança da fila exigiria exceções.
- **Lock pessimista:** no SQLite (`BEGIN IMMEDIATE` desde a leitura), serializa o serviço inteiro. No Postgres ([ADR 000](000-escolha-banco.md)), `SELECT ... FOR UPDATE` na atividade serializaria só a atividade, mas ainda prende a conexão durante a decisão.
- **Contador atômico (`UPDATE ... SET seatsTaken = seatsTaken + 1 WHERE seatsTaken < capacity`):** aguenta melhor uma disputa muito grande numa só atividade, mas tira a regra do domínio. Fica para quando houver carga real que o justifique.

## Consequências
- Novos status `waitlisted` e `awaiting_payment` e a nova mensagem `RegistrationPromoted`. `Registration.payment` (`{id, amount, description, requestedAt, paid}`) substitui a pendência `payment`.
- O schema de `registrations` mudou sem migração: bancos antigos do registration precisam ser recriados.
- Pagamento confirmado depois de a reserva expirar é ignorado. O caixa já cancela a cobrança, mas, se a corrida acontecer, o estorno ainda não existe.
- Numa atividade muito disputada, as tentativas repetidas aumentam a latência. O teste `concurrency.test.js` (8 instâncias, 200 inscrições, 30 vagas) não ultrapassa a capacidade.
- As mensagens são publicadas depois do commit, sem outbox: uma queda entre os dois perde a mensagem.

## Referências
- [011-evento-imutavel-apos-publicacao.md](011-evento-imutavel-apos-publicacao.md)
- [../../microservices/registration/README.md](../../microservices/registration/README.md)
