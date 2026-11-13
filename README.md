# EventHub

Trabalho da disciplina **Arquitetura de Software** (UECE), Wave 4: *Designing and Implementing a Microservices-Based System*.

Equipe: Caio Guerreiro, Gabriel Marques Araujo, Igor Ramsés Temóteo dos Santos, Renato Lenz Costalima, Rubens Abraão da Silva Sousa, Suyane Carvalho.

O EventHub é uma plataforma de eventos acadêmicos e profissionais. O organizador cria o evento e as atividades e publica. O participante se inscreve, paga (pagamento simulado), registra presença com um código e recebe o certificado.

## Documentação

- [Relatório arquitetural](docs/relatorio-arquitetural.md): forças, decomposição, padrões, falhas, validação e reflexão crítica.
- [Arquitetura](docs/arquitetura.md): contextos, dados, projeções e escala.
- [ADRs](docs/adrs/): decisões e seus gatilhos de revisão.
- [Contratos](microservices/contracts/README.md): mensagens (JSON Schema) e HTTP.
- [Diagramas](docs/diagrams/).

## Serviços

| Serviço | Contexto | Tecnologia |
|---|---|---|
| [web](microservices/web/) | BFF: telas (SSR) | Node, Express, EJS |
| identity | Cadastro, login, JWT | Node, Postgres |
| [secretariat](microservices/secretariat/) | Eventos e atividades | Node, SQLite |
| [registration](microservices/registration/) | Inscrições, vagas, fila de espera, check-in | Node, SQLite |
| payment | Cobranças (simuladas) | Python, FastAPI, SQLite |
| [certificate](microservices/certificate/) | Emissão e validação de certificados | Python, FastAPI, SQLite |
| [reports](microservices/reports/) | Relatórios por evento (CQRS) | Python, FastAPI, SQLite |
| notification | E-mails e avisos ao participante | Python, FastAPI + worker, SQLite |

- O navegador só fala com o `web`, que chama os serviços por HTTP repassando o JWT.
- Entre os serviços de domínio não há HTTP: só mensagens no RabbitMQ (exchange `event-hub`), com outbox, inbox, retry e DLQ.
- Um banco por serviço.

Detalhes técnicos comuns (portas, persistência, autenticação, mensageria): [microservices/README.md](microservices/README.md).

## Como executar

Pré-requisitos: Docker com Compose. Para os testes: Node.js 24 e [uv](https://docs.astral.sh/uv/) (Python).

```sh
cd microservices
cp .env.example .env          # troque os valores
docker compose up -d --build  # sobe tudo
```

| Endereço | O quê |
|---|---|
| http://localhost:3000 | Aplicação (web) |
| http://localhost:8026 | Mailpit: e-mails enviados pelas notificações |
| http://localhost:3005/certificates/validate/{token} | Validação pública de certificado (link do QR Code) |

```sh
docker compose logs -f <serviço>
docker compose down      # -v apaga os bancos
```

Roteiro para ver o fluxo completo:

1. Crie uma conta: ela entra direto em **Gestão**. Crie um evento com término hoje (só se encerra a partir da data de término), adicione uma atividade com preço e publique.
2. Em outra janela anônima, crie outra conta, abra o evento em **Eventos** e clique em **Inscrever-se**.
3. Clique em **Continuar compra** e em **Simular compra** (ou **Simular compra negada**).
4. Como organizador, abra o **Check-in** da atividade. O participante informa o código na página da inscrição.
5. O organizador encerra o evento; o participante baixa o certificado em **Certificados**.

### Desenvolvimento (hot reload)

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Monta o código do host e reinicia o serviço a cada alteração. Mudança de dependências exige `--build`. Só neste modo os serviços publicam porta no host:

| Serviço | Endereço | Swagger |
|---|---|---|
| registration | http://localhost:3001 | `/docs` |
| secretariat | http://localhost:3002 | `/docs` |
| identity | http://localhost:3003 | — |
| payment | http://localhost:3004 | `/docs` |
| reports | http://localhost:3006 | `/docs` |
| RabbitMQ (UI) | http://localhost:15673 (guest/guest) | — |

## Testes

| Suíte | Comando (a partir de `microservices/`) |
|---|---|
| Serviços Node | `cd <registration\|secretariat\|identity\|web\|contracts> && npm i && npm test` |
| `shared` | `cd shared && npm i && node --test` |
| payment, notification | `cd <serviço> && uv run pytest` |
| certificate, reports | `cd <serviço> && uv run --no-project --with-requirements requirements-dev.txt python -m pytest` |
| E2E (Playwright, com o compose rodando) | `cd e2e && npm i && npx playwright install chromium && npm test` |

Os testes e2e cobrem o fluxo principal e uma falha de dependência (`payment` fora do ar). Ver [e2e/README.md](microservices/e2e/README.md).

## Estrutura

```
docs/                 relatório, arquitetura, ADRs, diagramas
microservices/
  docker-compose.yml  ambiente completo; docker-compose.dev.yml para hot reload
  contracts/          JSON Schemas das mensagens e teste de contrato
  shared/             código comum aos serviços Node (mensageria, JWT, SQLite)
  e2e/                testes de ponta a ponta (Playwright)
  <serviço>/          um diretório e um Dockerfile por serviço
```
