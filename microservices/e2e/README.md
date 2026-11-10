# E2E (Playwright)

Testa as telas do `web` num navegador real: organizador cria e publica um evento pago; participante se cadastra, se inscreve e paga ([tests/fluxo.spec.js](tests/fluxo.spec.js)).

```sh
cd microservices && docker compose up -d --build   # app em http://localhost:3000
cd e2e && npm i && npx playwright install chromium  # 1ª vez
npm run watch   # abre o navegador e mostra cliques e preenchimentos
npm run debug   # Inspector: avança uma ação por vez (Step over / F10)
npm run ui      # modo UI: revê cada ação depois, com snapshot
npm test        # sem janela (headless)
npm run report  # relatório HTML com trace de cada teste
```

- `SLOWMO=800 npm run watch`: atraso por ação em ms (padrão 400; `0` para rodar rápido).
- `BASE_URL=http://host:porta`: outro endereço do web (padrão `http://localhost:3000`).
- Cada clique aparece como um círculo vermelho na página (script em [tests/fixtures.js](tests/fixtures.js)).
- Trace sempre gravado (`npx playwright show-trace test-results/.../trace.zip`); vídeo só em falha.
- Cada execução cria usuários e um evento novos (sufixo por timestamp); não há limpeza. `docker compose down -v` zera os bancos.
- Esperas: `toPass` repete a inscrição e recarrega a página enquanto as mensagens assíncronas (`UserRegistered`, `PaymentRequested`, `PaymentConfirmed`) não chegam.
- Para parar num ponto específico, ponha `await page.pause()` no teste e rode com `npm run watch`; o Inspector abre ali e você continua de lá.
- Para gravar um fluxo novo clicando no navegador: `npx playwright codegen localhost:3000`.
