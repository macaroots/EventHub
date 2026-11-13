# Título: Controle de vagas como regra do Credenciamento, não como microserviço à parte
Número do ADR: 003
Data: 2026-11-05
Responsável: Renato
Status: Aceito

## Contexto
Os requisitos de inscrição e capacidade são:
- **RF05 (Inscrições):** o participante se inscreve numa atividade, e a inscrição passa pelas regras de elegibilidade da atividade.
- **RF06 (Capacidade e espera):** cada atividade tem um número de vagas. Sem vaga, a inscrição entra numa fila de espera e é promovida, em ordem, quando uma vaga é liberada.
- **RN01:** a inscrição reserva a vaga ou entra na fila de espera.

A capacidade não pode ser excedida, mesmo na abertura das inscrições, quando muitas pessoas disputam a mesma atividade ao mesmo tempo e há mais de uma instância do serviço gravando no mesmo banco.

A pergunta é onde fica o controle de vagas:
1. **No Credenciamento (`registration`),** como regra de negócio da inscrição.
2. **Num microserviço de vagas à parte,** que guarda a ocupação e é consultado ou avisado pelo Credenciamento.

## Decisão
1. **O controle de vagas é regra do Credenciamento.** A `Activity` (aggregate do `registration`) guarda capacidade, ocupação e fila de espera, e decide o status de cada inscrição:

   ```
                ┌─ sem vaga ──> waitlisted ──(vaga liberada)──┐
   register ────┤                                             v
    (regras)    └─ com vaga ──────────────────────────────> confirmed
                                                              │
                                    (cancelada) ──> canceled ─┘ libera a vaga e promove o próximo da fila
   ```

   Os status que ocupam vaga somam no máximo `capacity`. As regras de fila e promoção estão no [README do registration](../../microservices/registration/README.md#regras-de-inscrição-adr-003).
2. **A `Activity` é a única porta de escrita das inscrições.** O repositório de `Registration` só lê.
3. **A capacidade é garantida em camadas:**
   - domínio: a `Activity` decide a vaga;
   - lock otimista (`activities.version`): em conflito, o app service recarrega e refaz;
   - banco: triggers recusam ocupar vaga sem vaga livre. É a rede de segurança contra bugs e outros caminhos de escrita.

## Justificativa
- **Vaga e inscrição são o mesmo conceito.** Ocupar vaga é o status da inscrição: não existe vaga ocupada sem inscrição, nem inscrição confirmada sem vaga. Separá-las dividiria um único aggregate em dois serviços.
- **A invariante precisa de uma transação.** Criar a inscrição, ocupar a vaga, cancelar e promover o próximo da fila têm de mudar juntos. No mesmo banco, isso é uma transação local. Em serviços separados, exigiria saga com compensação, e entre os passos a capacidade poderia ser excedida ou uma vaga ficar presa.
- **Disponibilidade da inscrição.** Com um serviço de vagas à parte, a inscrição dependeria de uma chamada síncrona a ele ([ADR 001](001-comunicacao-assincrona.md) evita HTTP entre domínios). Se ele caísse, ninguém se inscreveria.
- **Não há força que justifique separar.** Fronteira se define por modelo e linguagem, por equipe ou por necessidade própria de escala e disponibilidade. A vaga não tem linguagem própria, não tem outra equipe e escala junto com a inscrição: o pico de uma é o pico da outra.
- **Lock otimista** mantém a regra no domínio e funciona igual em SQLite e Postgres. Conflitos só acontecem na mesma atividade.
- **O trigger** torna a invariante independente do código da aplicação.

## Alternativas Consideradas
- **Microserviço de vagas à parte:** permitiria escalar e implantar a contagem de vagas separadamente e reaproveitá-la em outros contextos. Em troca, a invariante passaria a depender de saga ou de chamada síncrona, a ocupação seria duplicada por projeção no Credenciamento e a inscrição ficaria indisponível junto com o serviço de vagas. Nenhum requisito atual pede essa separação.
- **Lock pessimista:** no SQLite (`BEGIN IMMEDIATE` desde a leitura), serializa o serviço inteiro. No Postgres ([ADR 000](000-escolha-banco.md)), `SELECT ... FOR UPDATE` na atividade serializaria só a atividade, mas ainda prende a conexão durante a decisão.
- **Contador atômico (`UPDATE ... SET seatsTaken = seatsTaken + 1 WHERE seatsTaken < capacity`):** aguenta melhor uma disputa muito grande numa só atividade, mas tira a regra do domínio. Fica para quando houver carga real que o justifique.

## Consequências
- O Credenciamento concentra inscrição, elegibilidade, capacidade e fila de espera. Escalar a inscrição escala também o controle de vagas.
- A capacidade vem da cópia imutável da atividade recebida na publicação, então a invariante vale sobre dados que não mudam.
- Numa atividade muito disputada, as tentativas repetidas aumentam a latência. O teste `concurrency.test.js` (8 instâncias, 200 inscrições, 30 vagas) não ultrapassa a capacidade.
- Gatilhos para revisar: disputa numa atividade que o lock otimista não absorve (contador atômico ou processamento serial por atividade, [ADR 005](005-fila-de-acesso.md)), ou outro contexto que precise controlar vagas com regras próprias.

## Referências
- [001-comunicacao-assincrona.md](001-comunicacao-assincrona.md)
- [004-atualizacao-posicao-na-fila.md](004-atualizacao-posicao-na-fila.md)
- [006-forma-do-checkin.md](006-forma-do-checkin.md)
- [../../microservices/registration/README.md](../../microservices/registration/README.md)
