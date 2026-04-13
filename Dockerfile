# See https://hono.dev/docs/getting-started/nodejs#dockerfile
FROM node:24-bookworm-slim AS builder

WORKDIR /app
 
COPY package*.json .

RUN npm ci

COPY extensions/ extensions/
COPY container/tsconfig.json .
COPY container/ src/

RUN npm run build && \
    npm prune --production

FROM node:24-bookworm-slim

RUN apt-get update && \
    apt-get install -y ca-certificates

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/extensions /app/extensions
COPY --from=builder /app/package.json /app/package.json

RUN mkdir -p /app/tmp

EXPOSE 3000
 
CMD ["node", "/app/dist/src/index.js"]