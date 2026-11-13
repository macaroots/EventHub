# Título: Certificados em microsserviço próprio
Número do ADR: 008
Data: 2026-11-03
Responsável: Renato
Status: Proposto

## Contexto
É preciso emitir certificados de participação e validar a autenticidade deles, inclusive anos depois do evento. A emissão depende de dados de três serviços:
- presença (registration, pelo check-in);
- evento e atividade, incluindo carga horária (secretariat);
- nome do participante (identity).

Também se deseja implantar o serviço de certificados sem precisar implantar o sistema inteiro.

## Decisão
Criar um microsserviço `certificate` só para emitir e validar:
- **Entrada:** uma mensagem que carrega todos os dados do certificado, por exemplo `CertificateRequested {participantName, eventName, activities: [{name, workload, date}], totalWorkload}`. A mesma entrada pode chegar por API ou importação (CSV).
- **Saída:** um PDF, um código de validação e um endpoint público de validação.
- **Quem decide o direito ao certificado** (presença, carga horária mínima) é o registration, que emite `CertificateRequested`. O serviço de certificados não conhece essas regras.

## Justificativa
- É um subdomínio genérico: PDF, templates, assinatura e validação não dependem do Event Hub.
- Tem ciclo e carga próprios: emissão em lote depois do evento e validação pública por tempo indeterminado.
- Uma mensagem que traz todos os dados dispensa projeções de outros serviços. Assim o serviço pode ser implantado e usado sozinho.

## Alternativas Consideradas
- **No registration:** os dados de presença já estão lá, mas o serviço deixaria de ser implantável sozinho e incharia o contexto de inscrição.
- **Na secretaria:** a secretaria tem os dados do evento, mas não tem os de presença, e ganharia uma responsabilidade que não é dela.
- **Serviço próprio que monta projeções de vários serviços:** ficaria acoplado a três contratos e não funcionaria sem eles.

## Consequências
- Mais um serviço para implantar e operar.
- Persistência: metadados e código de validação no Postgres, e PDFs num armazenamento de objetos ([ADR 000](000-escolha-banco.md)).
- O registration passa a emitir `CertificateRequested`, um por participante, ao receber `EventEnded` da secretaria. O encerramento é manual, pelo organizador, para permitir correções de presença antes da emissão.
- O critério de elegibilidade (por atividade ou por evento, presença mínima) ainda precisa de um ADR. Implementado provisoriamente: um certificado por evento, com as atividades em que houve check-in (basta uma) ([registration](../../microservices/registration/README.md#certificados-adr-008)).
- Pré-requisito: o identity ainda não tem nome completo, só `username`.
- O certificado é uma cópia dos dados no momento da emissão. Mudanças posteriores (nome, carga horária) exigem reemissão.

## Referências
- [006-forma-do-checkin.md](006-forma-do-checkin.md)
- [001-comunicacao-assincrona.md](001-comunicacao-assincrona.md)
