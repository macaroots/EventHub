# Título: Fila de acesso (sala de espera de tráfego)
Número do ADR: 010
Data: 2026-11-05
Responsável: Renato
Status: Aceito

## Contexto
A arquitetura previa uma "fila de acesso" (`/queue`, websocket) no Credenciamento. Ela seria uma sala de espera para picos, como milhares de pessoas na abertura das inscrições.

Ela é diferente da fila de espera por vaga ([ADR 008](vaga-e-pagamento-como-status.md), [ADR 009](posicao-na-fila-de-espera.md)):

| | Fila de espera (`waitlisted`) | Fila de acesso |
|---|---|---|
| Pergunta que responde | Quem fica com a próxima vaga? | Quem pode entrar no sistema agora? |
| O que o primeiro ganha | Uma vaga (reserva, depois pagamento) | Só o direito de tentar se inscrever |
| Quando existe | Sempre que lota | Só em picos |
| Duração | Dias, e pode nunca andar | Minutos |
| Quem está nela | Uma inscrição (usuário, elegibilidade) | Um token descartável, muitos desistem |
| O que protege | A capacidade (invariante da `Activity`) | O sistema inteiro: páginas, inscrição, pagamento |
| Quem conhece | O domínio | Ninguém do domínio; é infraestrutura |

## Decisão
- A fila de acesso **não faz parte do Credenciamento** nem é um microsserviço de domínio: não tem linguagem nem regra de negócio, então não é um bounded context.
- **Não construir agora.** Contra abuso, basta um rate limit em `POST /registrations`.
- **Se houver pico real, terceirizar na borda** (CDN ou gateway): Cloudflare Waiting Room, Queue-it ou AWS Virtual Waiting Room. Os serviços continuam sem saber dela.
- A fila de espera por vaga **continua no registration**, dentro da `Activity`.

## Justificativa
- Unir as duas filas mistura semânticas: na fila de acesso, a posição chega a zero em minutos; na de espera, pode não andar. Também exigiria limpar milhares de inscrições abandonadas e guardar gente ainda anônima.
- A fila de acesso protege mais do que a inscrição (páginas, pagamento). Por isso ela pertence à borda, não a um serviço.
- Ela tem de sobreviver ao pico que segura, e os serviços de borda já fazem isso, com proteção contra bots, justiça na ordem e painel. Fazer em casa exige um componente separado, com escala própria, Redis (conjunto ordenado) e tokens assinados.
- Tirar a fila de espera do registration quebraria a garantia de capacidade, que depende de vaga e fila mudarem na mesma transação.

## Alternativas Consideradas
- **Microsserviço próprio de fila de acesso:** dá controle total, mas é infraestrutura genérica construída do zero, com o custo de operar justamente no pico.
- **Mesma fila para acesso e vaga (todo pedido vira inscrição em ordem):** viável só para a inscrição, e com os problemas da Justificativa.
- **Processamento serial por atividade** (aceitar o pedido numa fila durável, um consumidor por atividade, decidir as vagas em ordem): torna a inscrição barata no pico e elimina a disputa pelo lock. É a primeira opção se a inscrição em si for o gargalo, antes de uma sala de espera.

## Consequências
- Sai da lista de pendências do Credenciamento em [arquitetura.md](../arquitetura.md).
- Fornecedor externo traz custo por uso e dependência dele, e é ativado só em eventos de pico.
- Gatilhos para revisar: carga medida na abertura que o rate limit e a escala horizontal não absorvem, ou bots disputando vagas.

## Referências
- [vaga-e-pagamento-como-status.md](vaga-e-pagamento-como-status.md)
- [posicao-na-fila-de-espera.md](posicao-na-fila-de-espera.md)
- [../arquitetura.md](../arquitetura.md)
