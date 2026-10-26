FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 PRIME_DB=/data/prime.sqlite
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server.mjs ./
COPY src ./src
COPY public ./public
COPY migrations ./migrations
COPY scripts/hosted-start.mjs ./scripts/hosted-start.mjs
COPY scripts/backup-pc-setup.ps1 ./scripts/backup-pc-setup.ps1
COPY scripts/import-demo.mjs ./scripts/import-demo.mjs
RUN mkdir -p /data && chown node:node /data
EXPOSE 8080
CMD ["node", "scripts/hosted-start.mjs"]
