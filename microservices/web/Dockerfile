# Build context: microservices/ (para incluir shared/)
FROM node:25-alpine

WORKDIR /app
COPY shared/package*.json shared/
RUN cd shared && npm ci --omit=dev

WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci --omit=dev

COPY shared /app/shared
COPY web/src ./src

USER node
ENV PORT=3000
EXPOSE 3000

CMD ["node", "src/main.js"]
