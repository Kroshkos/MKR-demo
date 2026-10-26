# Альтернативный путь деплоя на Amvera: сборка через Docker
# (в панели: «Создать приложение» → окружение Docker; либо оставьте amvera.yml для сборки npm).
FROM node:20-bookworm-slim

# Зависимости для компиляции better-sqlite3 (node-gyp) при npm install
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --omit=dev=false --no-audit --no-fund

# postinstall при npm install не запускается до копирования client/, поэтому собираем явно
COPY . .
RUN npm --prefix client install --no-audit --no-fund \
    && npm run build \
    && npm prune --omit=dev

ENV NODE_ENV=production
VOLUME /data
EXPOSE 3001
CMD ["node", "server/src/index.js"]
