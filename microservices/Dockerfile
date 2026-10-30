# Imagem genérica: build context = microservices/, serviço escolhido via --build-arg SERVICE=<pasta>
FROM node:25-alpine
ARG SERVICE

WORKDIR /app

COPY shared/package*.json shared/
RUN cd shared && npm ci --omit=dev

COPY ${SERVICE}/package*.json ${SERVICE}/
RUN cd ${SERVICE} && npm ci --omit=dev

COPY shared shared
COPY ${SERVICE} ${SERVICE}
RUN mkdir -p ${SERVICE}/data && chown node:node ${SERVICE}/data

USER node
WORKDIR /app/${SERVICE}
ENV PORT=3000
EXPOSE 3000

CMD ["node", "src/main.js"]
