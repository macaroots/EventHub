# Título: Catálogo dentro da Secretaria e oferta de inscrição no Credenciamento
Número do ADR: 007
Data: 2026-11-03
Responsável: Renato
Status: Substituído em parte pelo [ADR 011](evento-imutavel-apos-publicacao.md): vale a decisão 1 (Catálogo); a decisão 2 (oferta no Credenciamento) foi descartada.

## Contexto
Hoje os dados de eventos e atividades se dividem em três contextos:
- **Secretaria:** dona de `Event` e `Activity`, incluindo `capacity`, `price` e `rules`.
- **Catálogo:** projeção pública de quase todos os campos de `Event` e `Activity`.
- **Credenciamento:** projeção de `capacity`, `price` e `rules`, onde as regras são aplicadas.

Há dois problemas:
- O Catálogo copia o modelo da Secretaria sem ter linguagem nem regras próprias. É só leitura pública.
- `capacity` é configurada na Secretaria, mas a regra que depende dela (ocupação) fica no Credenciamento. Por isso a Secretaria aceita reduzir a capacidade abaixo das inscrições confirmadas, e o erro só aparece depois, no Credenciamento.

## Decisão
1. **O Catálogo deixa de ser um serviço próprio.** A Secretaria passa a expor endpoints públicos de leitura em `/public/...`, só com eventos `published` e `canceled`.
2. **A oferta de inscrição passa para o Credenciamento.**
   - O Credenciamento passa a ser o dono de `capacity`, `price` e `rules`, e o organizador configura esses campos pela API dele.
   - A `Activity` da Secretaria fica só com a programação: nome, descrição, local e horário.
   - O Credenciamento expõe a oferta pública, com vagas restantes, em `/public/activities/:id/offer`.

## Justificativa
- **Fronteira de contexto se define por modelo e linguagem.** Na Secretaria, "atividade" é programação; no Credenciamento, é oferta de vagas. O Catálogo não tem um modelo próprio.
- **Uma regra que precisa de dados dos dois lados indica fronteira errada.** Com a oferta no Credenciamento, a capacidade e a ocupação ficam no mesmo aggregate e a invariante é checada na hora de alterar.
- **Projeções menores:** o Credenciamento passa a projetar só `{activityId, eventId}` e `{eventId, status, organizers}`.
- **O catálogo pode mostrar vagas restantes,** que a Secretaria não conhece.

## Alternativas Consideradas
- **Manter o Catálogo como serviço próprio:** isso só se justificaria pela escala do pico de leitura na abertura das inscrições, que se resolve com cache ou CDN. Se um dia for preciso, dá para extrair um deployable de leitura do mesmo contexto.
- **Manter a oferta na Secretaria e consultar a ocupação no Credenciamento por HTTP:** cria acoplamento síncrono contra a [ADR 001](comunicacao-assincrona.md) e uma condição de corrida entre a consulta e a alteração.
- **Projetar a ocupação na Secretaria:** a ocupação mudaria a cada inscrição, e a checagem continuaria com atraso.

## Consequências
- O organizador edita a atividade em dois lugares: a programação na Secretaria e a oferta no Credenciamento. O front (ou um BFF) esconde isso numa só tela.
- O participante vê a página da atividade composta de duas chamadas: programação (Secretaria) e oferta (Credenciamento).
- Uma atividade recém-criada fica sem oferta e não aceita inscrições até o organizador definir a capacidade.
- O Credenciamento ganha endpoints de organizador e passa a emitir `ActivityOfferUpdated`.
- A carga pública de leitura passa a cair na Secretaria e no Credenciamento.
- Migração de código:
  - tirar `capacity`, `price` e `rules` da Secretaria (entidade, SQLite e mensagens);
  - criar os endpoints de oferta no Credenciamento;
  - criar os endpoints `/public` nos dois serviços.

## Referências
- [checkin-no-registration.md](checkin-no-registration.md)
- [../endpoint.md](../endpoint.md)
- [../arquitetura.md](../arquitetura.md)
