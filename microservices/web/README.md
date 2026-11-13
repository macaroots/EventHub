# Web (BFF)

Telas renderizadas no servidor (Express + EJS). O navegador só fala com o `web`, que chama os serviços repassando o JWT do cookie `token`.

## Telas

Participante:
- `/` e `/events/:id`: catálogo público (`secretariat GET /public/events`).
- `/registrations[/:id]`: inscrições e status. Na fila de espera, a posição se atualiza sozinha ([ADR 004](../../docs/adrs/004-atualizacao-posicao-na-fila.md)). Com a inscrição confirmada, pede o código de check-in.
- `/payments/:id`: compra simulada (PIX ou cartão de demonstração), com prazo; **Simular compra** ou **Simular compra negada**. `/payments` lista as cobranças.
- `/certificates`: lista e baixa os PDFs.
- `/notifications`: avisos enviados ao participante.

Organizador (`/organizers/...`):
- `events`: lista e cria. `events/:id`: abas de informações (editar, publicar, encerrar, cancelar, apagar), atividades, organizadores (por e-mail) e relatórios (`reports`, exporta XLSX).
- `activities/:id`: formulário da atividade. `activities/:id/registrations`: inscrições, fila e pendências. `activities/:id/checkin`: abre/fecha o check-in; `?display=1` mostra o código para o projetor.

## Comportamento

- Post/Redirect/Get: toda ação redireciona; erro volta com `?error=`, mostrado pelo layout.
- Sem sessão, páginas protegidas levam a `/auth/login?next=<página>` (só caminhos locais). O cadastro já entra logado.
- Pagamento e confirmação são assíncronos: o BFF consulta a inscrição algumas vezes antes de redirecionar.
- Organizadores: o BFF troca e-mail por id no identity (`/internal/users`, `X-Internal-Token`).
- URLs dos serviços em `*_URL` (definidas no compose); datas no fuso `TIME_ZONE` (padrão `America/Sao_Paulo`).

Limitações: cancelar inscrição paga não estorna; logo após o cadastro, a inscrição pode falhar com `user not found` até o `UserRegistered` chegar; sem refresh token.

Testes no navegador: [e2e/README.md](../e2e/README.md).
