FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts

RUN mkdir -p /data && chown -R node:node /data /app
USER node

ENV NODE_ENV=production
ENV DATABASE_PATH=/data/amigo-invisible.db

EXPOSE 3001

CMD ["node", "src/server.js"]
