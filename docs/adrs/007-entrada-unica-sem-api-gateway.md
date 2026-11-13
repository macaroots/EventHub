# Título: Entrada única pelo BFF, sem API gateway
Número do ADR: 007
Data: 2026-11-09
Responsável: Renato
Status: Proposto

## Contexto
O item "Entrada única" do [arquitetura.md](../arquitetura.md#transversal) pede um API gateway na frente dos serviços. Hoje:
- **O único cliente é o navegador**, e ele só fala com o `web` (BFF, HTML renderizado no servidor). Nenhum requisito pede app mobile, CLI ou API para terceiros.    
- **As composições ficam no BFF:** e-mail → id do organizador e ids → nomes, além do status da fila de espera ([ADR 004](004-atualizacao-posicao-na-fila.md)). São composições de tela.
- **Na borda, o que se pede é:** TLS, rate limit em `POST /registrations` ([ADR 005](005-fila-de-acesso.md)), cache e CDN das páginas públicas ([ADR 002](002-catalogo-publico.md)) e balanceamento entre as instâncias do `web`.
- Cada serviço valida o JWT localmente (`shared/auth`), sem passar pelo identity.

## Decisão
- **Não adotar um API gateway agora.** O `web` é a única entrada da aplicação.
- **Os serviços ficam só na rede interna:**
  - `registration`, `secretariat`, `identity` e `payment` deixam de publicar porta no `docker-compose.yml`;
  - a porta continua no `docker-compose.dev.yml`, para depuração.
- **Na frente do `web`, um proxy reverso só de configuração** (Traefik, nginx, ou a própria CDN do [ADR 002](002-catalogo-publico.md)). Ele faz TLS, rate limit e balanceamento, e não tem código da aplicação.
- **Cada serviço continua validando o JWT.** A borda não substitui a autorização dos serviços.
- **Composição de tela fica no BFF de cada interface.** Uma composição que toda interface repete é sinal de regra de domínio e vai para o serviço dono, por exemplo uma projeção de usuários na secretaria.
- **Instâncias dos serviços**: o BFF chega a elas pelo DNS do orquestrador (Docker, Service do Kubernetes), não por um gateway.

## Justificativa
- Com um cliente só, um gateway duplicaria o papel do BFF. Seria mais um componente para operar, monitorar e escalar no pico, sem nenhum requisito que dependa dele.
- O risco concreto hoje é a exposição dos serviços, e fechar as portas resolve isso sem infraestrutura nova.
- As necessidades de borda (TLS, rate limit, cache, sala de espera) cabem num proxy reverso ou numa CDN já previstos nos ADRs 010 e 015.
- Composição num gateway compartilhado acopla todas as interfaces num ponto que precisa de código e deploy próprios, o problema que o BFF evita.

## Alternativas Consideradas
- **API gateway na frente de todos os serviços** (Kong, AWS API Gateway): centraliza roteamento, auth e rate limit. Só se paga com vários clientes chamando as APIs dos serviços.
- **Composição no gateway** (agregação, GraphQL federation): tira código do BFF, mas transforma o gateway num BFF genérico, com regra de tela e deploy acoplado.
- **BFF JSON compartilhado entre interfaces:** cada interface quer uma forma diferente de dados, e a maior parte das rotas viraria repasse.

## Consequências
- Quem quiser chamar um serviço direto em produção precisa estar na rede interna. Testes manuais usam o compose de dev.
- O `CORS_ORIGIN` do identity deixa de ser necessário, porque o navegador não o chama.
- Toda tela nova passa pelo BFF, mesmo quando só repassa a chamada. Esse é o custo de uma entrada só, e o helper `action` mantém esse repasse curto.
- **Gatilhos para revisar:**
  - um cliente fora do navegador (app mobile, CLI, integração de terceiros) chamando as APIs. Nesse caso, entra um gateway que publica só as rotas escolhidas, sem composição, e os serviços continuam validando o JWT;
  - uma rota pública servida por outro serviço, como a validação de certificados ([ADR 008](008-certificados.md)). Basta uma regra de roteamento no proxy, e um gateway não é necessário.

## Referências
- [008-certificados.md](008-certificados.md)
- [004-atualizacao-posicao-na-fila.md](004-atualizacao-posicao-na-fila.md)
- [005-fila-de-acesso.md](005-fila-de-acesso.md)
- [002-catalogo-publico.md](002-catalogo-publico.md)
- [../arquitetura.md](../arquitetura.md)
