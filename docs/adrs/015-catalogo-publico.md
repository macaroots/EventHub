# Título: Catálogo público na Secretaria, com cache e CDN
Número do ADR: 015
Data: 2026-11-07
Responsável: Renato
Status: Catálogo na Secretaria aceito e implementado; camadas de cache propostas

## Contexto
O projeto começou com um contexto Catálogo: um serviço que projetava quase todos os campos de `Event` e `Activity` para a leitura pública. Ele copiava o modelo da Secretaria sem ter linguagem nem regras próprias, e a única razão para existir era o pico de leitura na abertura das inscrições.

Com o catálogo dentro da Secretaria, esse pico precisa de cache. Hoje:
- a Secretaria não manda `Cache-Control` nem `ETag`;
- o participante vê o catálogo pela página do BFF (`web`), que busca o evento na Secretaria a cada requisição;
- o layout dessa página mostra o usuário logado, então o HTML muda de pessoa para pessoa e não pode ir para um cache compartilhado.

O conteúdo publicado é ótimo para cache, porque é imutável depois da publicação ([ADR 011](011-evento-imutavel-apos-publicacao.md)). Só mudam o status (`canceled`, `ended`) e os organizers, que não aparecem no catálogo público. As vagas restantes (RF04) mudariam a cada inscrição, mas ainda não são expostas.

O pico de leitura acontece na abertura das inscrições, quando muita gente abre a mesma página ao mesmo tempo.

## Decisão
**O catálogo não é um serviço próprio.** A Secretaria expõe a leitura pública em `GET /public/events` e `/public/events/:id`, sem login, só com eventos publicados e sem os organizers.

Para o pico de leitura, três camadas, ligadas conforme a necessidade:
1. **Secretaria (agora):** `/public/*` responde com `Cache-Control: public, max-age=60, stale-while-revalidate=300` e `ETag`. O TTL limita quanto tempo um cancelamento leva para aparecer.
2. **BFF (agora):**
   - **micro-cache em memória das respostas `/public`**, por poucos segundos e por instância. Durante o pico, a Secretaria recebe uma consulta por evento a cada intervalo, não uma por pessoa;
   - **a página pública não depende de sessão.** O HTML é o mesmo para todos, com `Cache-Control: public`. O que depende do usuário (cabeçalho com login, "já inscrito") sai do HTML e vem por fragmento ou JS.
3. **CDN (com pico real):** Cloudflare, CloudFront ou similar na frente das rotas públicas, a mesma borda que hospedaria a sala de espera do [ADR 010](010-fila-de-acesso.md). Os serviços não mudam: a CDN respeita o `Cache-Control`.

**Fica fora do cache longo:**
- tudo o que é autenticado e todos os `POST`;
- as vagas restantes, quando existirem: endpoint próprio no `registration`, com TTL de poucos segundos, carregado à parte pela página.

**Invalidação:** só por TTL. Purgar a CDN ao receber `EventCanceled` fica para quando o atraso de 60 s for um problema.

## Justificativa
- Fronteira de contexto se define por modelo e linguagem. O Catálogo não tem modelo próprio: é a programação da Secretaria vista de fora.
- A correção não depende do cache. Uma página antiga que mostra como aberto um evento já cancelado não gera inscrição indevida, porque o `registration` checa o status pela projeção dele e recusa.
- Como o conteúdo é imutável, a taxa de acerto fica alta, e o TTL só precisa cobrir o cancelamento.
- O micro-cache no BFF já resolve sem infraestrutura nova, e a CDN entra sem mudar código.

## Alternativas Consideradas
- **Catálogo como serviço próprio:** dá escala independente para a leitura, mas duplica o modelo da Secretaria por projeção e acrescenta um serviço. Se o cache não bastar, dá para extrair um deployable de leitura do mesmo contexto, com projeção alimentada pelo `EventPublished` e banco próprio.
- **Réplicas de leitura do banco da Secretaria:** dependem do Postgres ([ADR 000](000-escolha-banco.md)) e custam mais do que um cache para dados imutáveis.
- **Cache compartilhado (Redis) no BFF:** dá um cache só entre as instâncias, mas põe mais uma peça para operar. O micro-cache por instância basta enquanto houver poucas instâncias.
- **Invalidação por evento, sem TTL:** os dados ficam sempre atualizados, mas exige um consumidor que purgue a CDN e lide com falhas. É complexidade sem ganho, porque a correção já é garantida pelo `registration`.

## Consequências
- O cancelamento pode levar até cerca de 60 s (mais o `stale-while-revalidate` na CDN) para aparecer no catálogo.
- O layout do BFF muda: as páginas públicas deixam de receber o usuário no servidor.
- Com CDN, o painel de cache vira mais uma coisa a monitorar ([ADR 006](006-monitoramento.md)), e o custo é por tráfego.
- As vagas restantes no catálogo exigem um endpoint à parte, com o próprio perfil de carga.

## Referências
- [011-evento-imutavel-apos-publicacao.md](011-evento-imutavel-apos-publicacao.md)
- [010-fila-de-acesso.md](010-fila-de-acesso.md)
- [014-varias-instancias-por-servico.md](014-varias-instancias-por-servico.md)
