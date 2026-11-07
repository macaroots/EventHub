# Título: Posição na fila de espera e atualização da página
Número do ADR: 009
Data: 2026-11-05
Responsável: Renato
Status: Aceito

## Contexto
Com o [ADR 008](008-vaga-e-pagamento-como-status.md), quem se inscreve sem vaga fica `waitlisted` e é promovido quando uma vaga abre. O participante quer ver sua posição na fila. A página precisa se atualizar conforme a fila anda e, quando ele sair da fila, redirecionar:
- para `/payments/:id`, se ficar `awaiting_payment`;
- para a página da inscrição, se ficar `confirmed` ou `canceled`.

A fila muda pouco: anda quando alguém da frente cancela, tem o pagamento recusado ou perde a reserva por expiração (em minutos), ou quando a capacidade aumenta. Em eventos disputados, porém, ela pode ter milhares de pessoas esperando ao mesmo tempo.

A fila de acesso (`/queue`, sala de espera de tráfego) é outro assunto: ver o [ADR 010](010-fila-de-acesso.md).

## Decisão
Começar pela **opção 2 (polling com cache por atividade no BFF)**, desacoplada para poder migrar para a **opção 3 (push por SSE)** trocando só o transporte.

- **Posição:** é o número de inscrições `waitlisted` da mesma atividade com `createdAt` menor, mais um, calculado na leitura, sem guardar nada. É exposta como `waitlistPosition` em `GET /registrations/:id`.
- **Fila da atividade no registration:** `GET /activities/:id/waitlist` devolve os `registrationId` em ordem, sem dados pessoais, porque qualquer usuário logado pode consultar. Um id sozinho não dá acesso à inscrição.
- **Cache no BFF:** um `WaitlistSource` por atividade guarda essa lista por cerca de 2 s. O registration recebe uma consulta por atividade a cada intervalo, não uma por pessoa.
- **Endpoint da página:** `GET /registrations/:id/status.json` devolve `{status, waitlistPosition, next}`.
  - Na primeira consulta, o BFF pede a inscrição ao registration, que autoriza (dono, organizador ou admin). O par inscrição + usuário fica num cache de acesso. Depois disso, enquanto a inscrição está na lista em cache, a posição sai da memória, sem chamar o registration.
  - Quando a inscrição sai da lista, o BFF consulta a inscrição uma única vez e devolve `next` (`/payments/:id` ou `/registrations/:id`), e a página redireciona.
- **Página:** um único `watchRegistration(id, onUpdate)` esconde o transporte. Hoje é `fetch` a cada 3 a 5 s; sem JavaScript, `<meta refresh>` como fallback.

### Caminho para a opção 3, sem mudar o resto
- O payload `{status, waitlistPosition, next}` continua o mesmo.
- No servidor, troca-se o `WaitlistSource` de polling por um alimentado por mensagem (`WaitlistAdvanced {activityId}`, que invalida o cache da atividade), e o endpoint passa a servir também SSE.
- No navegador, troca-se a implementação de `watchRegistration` (`fetch` por `EventSource`).
- Gatilho para migrar: o BFF não dar conta da taxa de requisições (pessoas ÷ intervalo), ou a latência do polling atrapalhar a ida ao pagamento dentro do prazo da reserva.

## Opções

### 1. Recarregar a página periodicamente (`<meta refresh>`)
- Sem JavaScript e sem endpoint novo.
- A página pisca, a latência é o intervalo, e cada pessoa na fila custa uma requisição completa por intervalo.

### 2. Consultar um endpoint pequeno com `fetch` periódico
- O BFF expõe `/registrations/:id/status.json` (`{status, waitlistPosition, next}`), e a página troca o número ou redireciona.
- Não guarda estado no servidor, não precisa de infraestrutura nova e funciona com várias instâncias. Segue o padrão `settled` do pagamento.
- A carga é constante: pessoas na fila ÷ intervalo (10 mil pessoas a cada 5 s dão 2 mil req/s), mesmo com a fila parada.
- Hoje cada consulta carregaria a `Activity` com todas as inscrições. Para escalar, a posição precisa vir de uma consulta indexada ou de um cache da fila por atividade no BFF (por exemplo, de 2 s). Com o cache, o registration recebe uma consulta por atividade a cada intervalo, não uma por pessoa.
- A opção 1 serve de fallback sem JavaScript.

### 3. Push por SSE no BFF, disparado por mensagem
- O registration publica `WaitlistAdvanced {activityId, ...}` quando a fila muda. O BFF ouve no RabbitMQ, numa fila exclusiva por instância (cada uma recebe todas as mensagens), e empurra a nova posição para as conexões SSE abertas daquela atividade.
- Atualiza na hora e só gera tráfego quando a fila anda.
- Custos:
  - **Conexões abertas:** uma por pessoa na fila. O Node aguenta dezenas de milhares de conexões ociosas por processo, mas é preciso ajustar timeouts de proxy e balanceador, mandar heartbeat a cada 15 a 30 s e usar HTTP/2 (no HTTP/1.1 o navegador limita a 6 conexões por domínio, o que afeta várias abas).
  - **Recalcular posições:** quando alguém sai da fila, todos atrás mudam. O BFF não pode consultar o registration por conexão, porque isso daria N chamadas por mudança, pior que a opção 2. Saídas possíveis:
    - a mensagem leva o `createdAt` de quem saiu, e cada conexão decrementa se ele estava à frente (sem consulta, mas com risco de divergência; precisa ressincronizar periodicamente);
    - o BFF busca a fila da atividade uma vez por mensagem;
    - a mensagem leva a lista ordenada de ids (fica grande em filas grandes).
  - **Rajadas:** cada mudança gera N envios. Se a fila andar rápido, isso supera o polling; é preciso agrupar os envios por atividade (no máximo um por segundo).
  - **Reconexões em massa:** num deploy ou queda do BFF, todos reconectam juntos. É preciso `retry` com variação aleatória no SSE e mandar o estado atual em cada conexão, porque mensagens são perdidas durante a reconexão.
  - **Operação:** o BFF passa a depender do RabbitMQ e a guardar estado (conexões). O deploy derruba conexões. É preciso monitorar as conexões abertas.

### 4. SSE servido pelo registration, com o BFF só repassando
- O BFF não precisa do RabbitMQ.
- O registration passa a segurar conexões longas, e o repasse pelo BFF complica timeouts e buffering. Mistura transporte com o domínio.

### 5. WebSocket
- Faz o mesmo que a opção 3, com mais complexidade (protocolo próprio, upgrade, proxies). Só compensa se o navegador precisar mandar dados, o que não é o caso.

## Critérios para decidir
- Tamanho esperado da maior fila e quantas vezes por minuto ela anda.
- Latência aceitável até o usuário ver a mudança. O redirecionamento para o pagamento é o ponto sensível, porque a reserva tem prazo.
- Disposição para o BFF guardar estado e depender do RabbitMQ.

## Comparação de escala
- A carga da opção 2 é proporcional a pessoas ÷ intervalo e não depende do movimento da fila. Com o cache por atividade, cada consulta é barata, em memória. O gargalo é a taxa de requisições no BFF, que escala horizontalmente e sem estado.
- A carga da opção 3 é proporcional a mudanças × pessoas daquela atividade, mais as conexões abertas. É a melhor quando a fila anda pouco em relação ao intervalo do polling, que é o caso típico. O gargalo é segurar conexões e as rajadas e reconexões em massa.
- Ponto de virada aproximado: a opção 3 vence quando a fila muda menos de uma vez por intervalo de polling e o número de pessoas esperando é grande (milhares). A opção 2 com cache segue bem até lá, com muito menos complexidade.
- Nos dois casos, o endpoint de posição e o redirecionamento são os mesmos. Migrar da opção 2 para a 3 troca só o transporte.

## Consequências
- Não precisa de infraestrutura nova: o BFF continua sem estado (o cache é descartável) e sem RabbitMQ, e escala horizontalmente.
- A carga é constante: pessoas ÷ intervalo no BFF, mesmo com a fila parada. Cada requisição é barata (memória), e o registration recebe uma consulta por atividade por intervalo.
- A posição pode atrasar até o TTL do cache mais o intervalo do polling (alguns segundos).
- Cada instância do BFF tem o seu cache, então o registration recebe uma consulta por atividade × instância × intervalo. Se pesar, um cache compartilhado (Redis) resolve.
- A migração para a opção 3 fica restrita ao `WaitlistSource` e ao `watchRegistration`.

## Referências
- [008-vaga-e-pagamento-como-status.md](008-vaga-e-pagamento-como-status.md)
- [001-comunicacao-assincrona.md](001-comunicacao-assincrona.md)
- [004-notificacoes.md](004-notificacoes.md)
