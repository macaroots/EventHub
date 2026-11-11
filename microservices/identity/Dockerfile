# Build context: microservices/ (so shared/ is accessible)
# Build: docker build -f identity/Dockerfile -t eventhub-identity .
FROM node:22-alpine AS base

# ---- deps ----
FROM base AS deps
WORKDIR /app
COPY shared/package*.json shared/
RUN cd shared && npm ci --omit=dev

WORKDIR /app/identity
COPY identity/package*.json ./
RUN npm ci --omit=dev

# ---- release ----
FROM base AS release
WORKDIR /app

COPY --from=deps /app/shared/node_modules shared/node_modules
COPY shared /app/shared

COPY --from=deps /app/identity/node_modules identity/node_modules
COPY identity/package.json /app/identity/package.json
COPY identity/src /app/identity/src
COPY identity/scripts /app/identity/scripts
COPY identity/migrations /app/identity/migrations

RUN mkdir -p data && chown node:node data
WORKDIR /app/identity

# Run as non-root
USER node

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["node", "src/main.js"]
