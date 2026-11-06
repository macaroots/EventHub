# Título: Evento e atividades imutáveis após a publicação
Número do ADR: 011
Data: 2026-11-05
Responsável: Renato
Status: Aceito

## Contexto
A Secretaria permitia alterar eventos e atividades publicados, inclusive `capacity`, `price` e `rules`. Cada alteração virava mensagem (`EventUpdated`, `ActivityUpdated`...), e o Credenciamento precisava reagir a ela sobre inscrições já existentes. Isso gerava casos difíceis:
- capacidade reduzida abaixo das inscrições (rejeitada no Credenciamento, sem a Secretaria saber);
- preço alterado com cobranças em andamento;
- regra nova sobre inscrições já aceitas.

O [ADR 007](fronteiras-secretaria-credenciamento.md) propunha resolver isso movendo a oferta (`capacity`, `price`, `rules`) para o Credenciamento, o que obrigaria o organizador a editar a atividade em dois serviços.

## Decisão
1. **O conteúdo do evento e das atividades só muda em `draft`.** Depois de publicado, o evento só pode ser cancelado. Organizadores continuam mudando até o cancelamento, porque são controle de acesso, não conteúdo publicado.
2. **A Secretaria é a dona de toda a informação do evento e das atividades,** incluindo capacidade, preço e regras de elegibilidade. Ela define o que é oferecido.
3. **O Credenciamento é o dono das inscrições e da ocupação.** Na publicação, ele recebe uma cópia imutável do evento e das atividades e aplica as regras sobre ela.
4. **Mensagens:**
   - `EventPublished {eventId, name, startDate, endDate, organizers, activities: [{activityId, name, startsAt, endsAt, capacity, price, rules}]}`: o retrato completo, numa só mensagem;
   - `EventCanceled {eventId, reason}`;
   - `EventOrganizersChanged {eventId, organizers}`: só de evento publicado.

   O rascunho não gera mensagens. Saem `EventCreated`, `EventUpdated`, `EventDeleted` e `ActivityCreated/Updated/Deleted`.
5. **O ADR 007 é substituído na parte da oferta.** A parte do Catálogo (endpoints `/public` na Secretaria) continua valendo.

## Justificativa
- O evento publicado é o contrato com os inscritos. Mudar vagas, preço ou regras depois dele é mudar o contrato com quem já se inscreveu.
- Com a cópia imutável, o Credenciamento não precisa reconciliar mudanças: as invariantes (capacidade, fila, cobrança) valem sobre dados que não mudam.
- Cada informação tem um único dono e um único momento de transferência. A Secretaria não precisa saber da ocupação, e o Credenciamento não precisa editar a oferta.
- Uma única mensagem na publicação resolve a ordem de chegada (atividades antes do evento) e o descarte de rascunhos nas projeções.

## Alternativas Consideradas
- **Oferta no Credenciamento ([ADR 007](fronteiras-secretaria-credenciamento.md)):** edição em dois lugares, composição na tela e uma atividade sem oferta até alguém configurá-la.
- **Permitir mudanças após a publicação com regras de reconciliação:** cada campo exigiria uma política (o que fazer com quem já pagou se o preço muda, com quem ficou sem vaga se a capacidade cai) e mensagens de correção.
- **Permitir só mudanças "seguras" (aumentar capacidade, corrigir texto):** é útil, mas reabre o canal de atualização. Fica para quando houver necessidade real; o caminho seria uma mensagem específica, como `ActivityCapacityIncreased`.

## Consequências
- Um erro no evento publicado exige cancelar e publicar outro. As inscrições do cancelado são canceladas.
- As telas do organizador bloqueiam a edição de evento e atividades fora de `draft`.
- O Credenciamento cria evento e atividades uma única vez, ao receber `EventPublished`, e ignora repetições. Ignora também `EventCanceled` de um evento que nunca foi publicado.
- O Credenciamento perdeu `upsertActivity`, `deleteActivity` e os setters da `Activity` (nome, capacidade, preço, regras).
- Textos descritivos (descrição, local) não vão para o Credenciamento. Se notificações ou crachás precisarem deles, entram no `EventPublished`.

## Referências
- [fronteiras-secretaria-credenciamento.md](fronteiras-secretaria-credenciamento.md)
- [vaga-e-pagamento-como-status.md](vaga-e-pagamento-como-status.md)
