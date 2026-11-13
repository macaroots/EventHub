# E2E (Playwright)

Testa as telas do `web` num navegador real, com o compose rodando:

- [tests/fluxo.spec.js](tests/fluxo.spec.js): organizador cria e publica um evento pago; participante se cadastra, se inscreve e paga.
- [tests/falha-dependencia.spec.js](tests/falha-dependencia.spec.js): `docker compose stop payment`; a inscrição continua funcionando e a tela de pagamento mostra erro controlado; `docker compose start payment` e a compra é concluída com o `PaymentRequested` que esperou na fila. Precisa do `docker` local (não roda contra um `BASE_URL` remoto). Se interromper o teste no meio, rode `docker compose start payment`.

```sh
npm i && npx playwright install chromium  # 1ª vez
npm test                 # headless; npx playwright test falha (só um arquivo)
npm run watch            # abre o navegador
npm run debug            # Inspector, uma ação por vez
npm run report           # relatório HTML com trace
```

- `SLOWMO=800`: atraso por ação em ms (padrão 400; `0` para rodar rápido). `BASE_URL`: outro endereço do web.
- Cada execução cria usuários e eventos novos; `docker compose down -v` zera os bancos.
- `toPass` repete passos enquanto as mensagens assíncronas não chegam.
