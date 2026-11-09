# Título: Adicionar organizador por e-mail (rotas internas do identity)
Número do ADR: 016
Data: 2026-11-08
Responsável: Renato
Status: Aceito

## Contexto
O identity novo (Postgres, bcrypt) não tem mais `GET /users` nem `GET /users?username=` ([ADR 013](013-organizador-por-username.md)). Ele expõe rotas `/internal/users` protegidas por `X-Internal-Token`, e o [endpoint.md](../endpoint.md#identidade) prevê o organizador por e-mail. O JWT só tem `{userId, name}`.

## Decisão
- O formulário pede o e-mail. O BFF chama `GET /internal/users?email=` e depois `secretariat.addOrganizer` com o id.
- A página do evento traduz ids em nomes com `POST /internal/users/batch {ids}`.
- O BFF manda `X-Internal-Token` (`INTERNAL_API_TOKEN`), e não o JWT do usuário.

## Justificativa
Segue a API do identity sem alterá-la. A busca deixa de baixar todos os usuários, e o batch só traz quem organiza o evento.

## Alternativas Consideradas
- **Manter username:** exigiria uma rota nova no identity.
- **Projeção de usuários na secretaria:** sem chamadas síncronas, mas é mais código; compensa quando houver regra para `UserDeactivated`.

## Consequências
- Quem tem o `INTERNAL_API_TOKEN` consulta qualquer usuário por e-mail; o token não pode chegar ao navegador.
- Usuário desativado não aparece no batch: a tela mostra o id.
- Quem chamar a secretaria direto ainda pode adicionar um `userId` que não existe.

## Referências
- [../endpoint.md](../endpoint.md)
- [../../microservices/web/README.md](../../microservices/web/README.md)
