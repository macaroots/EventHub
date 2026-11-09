# Título: Adicionar organizador por username (busca no BFF)
Número do ADR: 013
Data: 2026-11-06
Responsável: Renato
Status: Substituído pelo [ADR 016](016-organizador-por-email.md)

## Contexto
O formulário de organizadores pede o username. A secretaria guarda só o `userId`. Antes, o BFF baixava todos os usuários do identity (`GET /users`, que era público) e filtrava em memória.

## Decisão
- O BFF traduz o username em id e depois chama `secretariat.addOrganizer`. Isso é composição para a tela.
- O identity tem o filtro `GET /users?username=x`, que devolve o usuário ou 404.
- `GET /users` passa a exigir JWT, e o BFF repassa o token de quem está logado.

## Justificativa
A secretaria continua sem saber que o identity existe, e não há chamada síncrona entre serviços de domínio. Com o filtro, o BFF deixa de baixar todos os usuários.

## Alternativas Consideradas
- **A secretaria valida o `userId` no identity ao adicionar o organizador:** é mais correto, porque não depende do BFF, mas cria um acoplamento síncrono entre a secretaria e o identity.
- **Projeção de usuários na secretaria** (`UserCreated`, `UserDeactivated`): a secretaria não faz nenhuma chamada e poderia barrar usuários inativos, mas a projeção é eventualmente consistente e é mais código. Só compensa quando houver regra sobre usuário inativo.

## Consequências
- Quem chamar a secretaria direto pode adicionar um `userId` que não existe.
- Qualquer usuário logado ainda lista todos os usuários. Para traduzir ids em usernames, um filtro `?ids=` resolveria.
- `User` ainda não tem `active`, `name` nem `email`, que o [endpoint.md](../endpoint.md) prevê.

## Referências
- [../endpoint.md](../endpoint.md)
- [../../microservices/web/README.md](../../microservices/web/README.md)
