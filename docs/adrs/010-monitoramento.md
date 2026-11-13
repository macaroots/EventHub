# Título: Monitoramento com ferramentas padrão, não por eventos de domínio
Número do ADR: 010
Data: 2026-11-03
Responsável: Renato
Status: Proposto

## Contexto
É preciso saber se os serviços estão no ar e onde há erros, lentidão ou filas acumuladas, e seguir uma operação de ponta a ponta entre serviços. Eventos de domínio contam o que aconteceu no negócio, não a saúde dos serviços.

## Decisão
Usar ferramentas padrão em vez de um serviço próprio:
- **Health check:** `/health` em cada serviço, usado pelo Docker ou orquestrador.
- **Logs estruturados:** em JSON, centralizados (ex.: Loki ou ELK).
- **Métricas:** requisições, erros, latência e tamanho de fila (Prometheus + Grafana); o painel de administração do RabbitMQ para as filas.
- **Rastreamento distribuído:** OpenTelemetry, com um id de correlação propagado nas mensagens.
- **Fila de mensagens mortas (DLQ):** hoje, quando um handler falha, o erro só vai para o log e a mensagem é confirmada mesmo assim, então se perde. Com a DLQ, a mensagem fica guardada para inspeção e reprocessamento.

## Justificativa
- São problemas já resolvidos por ferramentas maduras; construir um serviço próprio não traz ganho.
- Os serviços continuam independentes: cada um só expõe health, logs e métricas.
- A DLQ e o id de correlação atacam as falhas que mais doem num sistema por mensagens: perda silenciosa e dificuldade de rastrear.

## Alternativas Consideradas
- **Monitorar pelo serviço de relatórios, a partir dos eventos de domínio:** não enxerga falhas, lentidão nem serviço fora do ar, que não geram evento.
- **Serviço próprio de monitoramento:** reimplementaria o que as ferramentas padrão já fazem.

## Consequências
- Mais componentes de infraestrutura no `docker-compose` (Prometheus, Grafana, coletor de logs).
- O bus muda: passa a propagar o id de correlação e a mandar falhas para a DLQ em vez de confirmá-las.
- Pode ser adotado aos poucos: health e DLQ primeiro, depois logs, métricas e rastreamento.

## Referências
- [../../microservices/shared/messaging/rabbitmq-message-bus.js](../../microservices/shared/messaging/rabbitmq-message-bus.js)
