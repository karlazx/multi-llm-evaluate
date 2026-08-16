# ── Stage 1: 构建前端 ────────────────────────────────────────────
FROM node:22-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY web ./web
COPY vite.config.ts ./
RUN npm run web:build

# ── Stage 2: 运行时（后端 + 托管前端）────────────────────────────
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY --from=frontend /app/web/dist ./web/dist
EXPOSE 8787
CMD ["npx", "tsx", "server/src/index.ts"]
