# Título: Adicionar organizador por e-mail (rotas internas do identity)
Número do ADR: 016
Data: 2026-11-08
Responsável: Renato
Status: Aceito

## Contexto
O formulário de organizadores identifica a pessoa pelo e-mail, como prevê o [endpoint.md](../endpoint.md#identidade), mas a secretaria guarda só o `userId`. Alguém precisa traduzir um no outro, e a secretaria não conhece o identity.

O identity expõe rotas `/internal/users` protegidas por `X-Internal-Token`. O JWT só tem `{userId, name}`.

## Decisão
- **Composição para a tela, no BFF.** O formulário pede o e-mail. O BFF chama `GET /internal/users?email=` e depois `secretariat.addOrganizer` com o id.
- A página do evento traduz ids em nomes com `POST /internal/users/batch {ids}`.
- O BFF manda `X-Internal-Token` (`INTERNAL_API_TOKEN`), e não o JWT do usuário.

## Justificativa
A secretaria continua sem saber que o identity existe, e não há chamada síncrona entre serviços de domínio. Segue a API do identity sem alterá-la. A busca deixa de baixar todos os usuários, e o batch só traz quem organiza o evento.

## Alternativas Consideradas
- **A secretaria valida o `userId` no identity ao adicionar o organizador:** não depende do BFF e evita ids inexistentes, mas cria acoplamento síncrono entre a secretaria e o identity.
- **Username no lugar do e-mail:** foi a primeira versão. Exigiria uma rota pública de busca no identity, e o e-mail é o que o organizador conhece.
- **Projeção de usuários na secretaria:** sem chamadas síncronas, mas é mais código; compensa quando houver regra para `UserDeactivated`.

## Consequências
- Quem tem o `INTERNAL_API_TOKEN` consulta qualquer usuário por e-mail; o token não pode chegar ao navegador.
- Usuário desativado não aparece no batch: a tela mostra o id.
- Quem chamar a secretaria direto ainda pode adicionar um `userId` que não existe.

## Referências
- [../endpoint.md](../endpoint.md)
- [../../microservices/web/README.md](../../microservices/web/README.md)
