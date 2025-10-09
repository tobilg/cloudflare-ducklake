# See https://hono.dev/docs/getting-started/nodejs#dockerfile
FROM node:22-bookworm-slim AS builder

WORKDIR /app
 
COPY package*.json .

RUN npm ci

COPY extensions/ extensions/
COPY container/tsconfig.json .
COPY container/ src/

RUN npm run build && \
    npm prune --production

FROM node:22-bookworm-slim

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 hono && \
    apt-get update && \
    apt-get install -y ca-certificates

COPY --from=builder --chown=hono:nodejs /app/node_modules /app/node_modules
COPY --from=builder --chown=hono:nodejs /app/dist /app/dist
COPY --from=builder --chown=hono:nodejs /app/extensions /app/extensions
COPY --from=builder --chown=hono:nodejs /app/package.json /app/package.json

RUN mkdir -p /app/tmp && \
    chown -R hono:nodejs /app/tmp && \
    chmod -R 755 /app/tmp

USER hono

EXPOSE 3000
 
CMD ["node", "/app/dist/src/index.js"]