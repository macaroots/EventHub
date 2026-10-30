# Build context: microservices/ (para incluir shared/)
FROM node:25-alpine

WORKDIR /app
COPY shared/package*.json shared/
RUN cd shared && npm ci --omit=dev

WORKDIR /app/payment
COPY payment/package*.json ./
RUN npm ci --omit=dev

COPY shared /app/shared
COPY payment/src ./src

USER node
ENV PORT=3000
EXPOSE 3000

CMD ["node", "src/main.js"]
