# Título: Integração entre serviços por eventos, sem chamadas síncronas entre domínios
Número do ADR: 001
Data: 2026-10-30
Responsável: Renato
Status: Aceito

## Contexto
O sistema se divide em contextos (Identidade, Secretaria, Credenciamento, Caixa e, depois, Notificações, Certificados e Relatórios), cada um com seu serviço e seu banco. Os fluxos atravessam os contextos:
- a publicação de um evento na Secretaria abre as inscrições no Credenciamento;
- uma inscrição paga gera uma cobrança no Caixa, e o resultado volta ao Credenciamento;
- o encerramento do evento leva aos certificados.

Os picos de carga caem em serviços diferentes: inscrições no Credenciamento, leitura pública na Secretaria, gateway externo no Caixa. Uma lentidão ou queda num deles não pode derrubar os outros. A ideia é também que cada serviço possa ser desenvolvido e implantado sem conhecer a implementação dos outros.

## Decisão
- **Entre serviços de domínio, só mensagens.** Um serviço publica o que aconteceu (`EventPublished`, `RegistrationConfirmed`, `PaymentConfirmed`...), e quem se interessa reage. Nenhum serviço de domínio chama outro por HTTP.
- **Coreografia, sem orquestrador.** Cada serviço sabe o que fazer ao receber uma mensagem. Fluxos longos, como inscrição → cobrança → confirmação, são sequências de eventos, e não um processo central.
- **Dados de outro contexto viram projeção local**, só com os campos necessários e alimentada pelas mensagens. Por exemplo, o Credenciamento guarda uma cópia imutável do evento publicado.
- **Broker: RabbitMQ**, com um exchange `topic` e uma fila durável por serviço.
- **Entrega confiável** ([microservices/README](../../microservices/README.md#entrega-das-mensagens)):
  - outbox: estado e mensagem na mesma transação;
  - envelope `{id, type, source, time, data}` ([contracts](../../microservices/contracts/README.md#envelope));
  - inbox no consumidor, para descartar mensagens repetidas;
  - retry e DLQ quando um handler falha.
- **HTTP síncrono só nas bordas:**
  - o BFF consulta e comanda os serviços em nome do usuário e compõe as telas ([ADR 007](007-entrada-unica-sem-api-gateway.md));
  - os serviços validam o JWT localmente, sem chamar o identity.

## Justificativa
- **Isolamento de falhas:** se o Caixa ou o gateway de pagamento caem, as inscrições continuam e as cobranças esperam na fila. Com HTTP entre serviços, a indisponibilidade de um se propaga para todos os que dependem dele.
- **Picos absorvidos pela fila:** cada serviço consome no seu ritmo e escala sozinho.
- **Autonomia:** o produtor não sabe quem consome. Notificações, Certificados e Relatórios ([ADR 009](009-notificacoes.md), [ADR 008](008-certificados.md)) entram ouvindo eventos que já existem, sem mudar os outros serviços.
- **RabbitMQ em vez de Kafka:** o sistema precisa de filas de trabalho com retry, DLQ e roteamento por tipo, que o RabbitMQ oferece prontos. O que o Kafka tem a mais (log retido, reprocessamento, vazão muito alta) não é requisito hoje e custa mais para operar.
- **Coreografia em vez de orquestração:** os fluxos têm poucos passos e cada passo tem um dono claro. Um orquestrador concentraria a regra de vários contextos num lugar só.

## Alternativas Consideradas
- **HTTP síncrono entre serviços:** é mais simples de seguir e dá consistência imediata, mas acopla a disponibilidade e a latência de todos. Também obrigaria cada serviço a conhecer os endereços e contratos dos outros.
- **Kafka:** o log retido permitiria reprocessar o histórico (útil para Relatórios), mas retry e DLQ teriam de ser construídos e a operação é mais pesada. Vale rever se a vazão ou o reprocessamento virarem requisito.
- **Orquestração (saga com coordenador, ou Temporal):** deixa o fluxo explícito num lugar só e facilita compensações. Compensa quando os fluxos tiverem muitos passos ou prazos entre serviços.
- **Banco compartilhado:** integra sem mensagens, mas acopla os modelos e impede a evolução independente.

## Consequências
- **Consistência eventual:** um dado de outro contexto pode estar atrasado. Por exemplo, logo após o cadastro, a inscrição pode falhar com `user not found` até a projeção chegar.
- **Entrega pelo menos uma vez:** todo handler precisa ser idempotente, e uma mensagem em retry pode chegar fora de ordem.
- **Fluxo difícil de seguir:** nenhum lugar mostra o processo inteiro. Mitigação: id de correlação e rastreamento ([ADR 010](010-monitoramento.md)) e o catálogo de mensagens em [contracts](../../microservices/contracts/README.md).
- **Contratos de mensagem são API pública:** uma mudança no formato quebra consumidores, então a mudança precisa ser compatível ou versionada.
- **O RabbitMQ não guarda histórico:** quem começa a ouvir depois não recebe os eventos anteriores.
- **Validação entre contextos fica fraca:** a Secretaria aceita um organizador sem saber se o usuário existe. Quando isso importar, a saída é uma projeção, não uma chamada síncrona.

## Referências
- [../../microservices/README.md](../../microservices/README.md#entrega-das-mensagens)
- [../../microservices/contracts/README.md](../../microservices/contracts/README.md)
- [007-entrada-unica-sem-api-gateway.md](007-entrada-unica-sem-api-gateway.md)
