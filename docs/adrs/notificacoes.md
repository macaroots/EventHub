# Título: Notificações em microsserviço próprio
Número do ADR: 004
Data: 2026-11-03
Responsável: Renato
Status: Proposto

## Contexto
Os participantes precisam ser avisados de inscrição confirmada, pagamento pendente, evento cancelado e certificado emitido. Os avisos podem ir por e-mail e, no futuro, por outros canais.

## Decisão
Criar um microsserviço `notification`. Ele ouve os eventos de domínio (`RegistrationConfirmed`, `PaymentRequested`, `EventCanceled`...) e transforma cada um num aviso a partir de templates. Ele também cuida de canais, reenvio e histórico de envios.

## Justificativa
- É um subdomínio genérico: envio, templates, canais e reenvio não são regra de negócio de nenhum contexto.
- Ouvir os eventos de domínio segue a coreografia que o projeto já usa, e os produtores não precisam saber que notificações existem.
- Falhas ou lentidão no envio não afetam inscrição nem pagamento.

## Alternativas Consideradas
- **Comando `NotificationRequested` enviado por cada serviço:** o serviço de notificações fica genérico e implantável sozinho, mas cada produtor passa a decidir o que notificar e precisa conhecer o serviço. Pode ser adotado depois, convivendo com a escuta dos eventos de domínio.
- **Cada serviço envia os próprios e-mails:** duplica a integração com o provedor e os templates em todos os serviços.

## Consequências
- O serviço de notificações conhece os eventos de todos os contextos: uma mudança de contrato num evento pode quebrar um template.
- O serviço precisa do contato do participante. Pré-requisito: o identity ainda não tem e-mail, que teria de vir nos eventos de usuário (projeção própria).
- O aviso é enviado depois do fato e pode atrasar.

## Referências
- [comunicacao-assincrona.md](comunicacao-assincrona.md)
