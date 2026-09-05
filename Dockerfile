# ── Stage 1: 前端构建 ────────────────────────────────────────────
FROM node:22-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY web ./web
COPY vite.config.ts tsconfig.json ./
RUN npm run web:build

# ── Stage 2: 后端编译（TS → JS）──────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY server ./server
COPY tsconfig.json tsconfig.server.json ./
RUN npm run build:server

# ── Stage 3: 运行时（精简：dev 与 optional 依赖全部不进）──────────
# promptfoo 的 optional 依赖含大量平台二进制（codex/claude-agent-sdk/onnxruntime/sharp 等 200+ 包），
# 评测链路（openai/anthropic provider + llm-rubric/javascript 断言）均不需要它们。
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional
COPY --from=build /app/server/dist ./server/dist
COPY --from=web /app/web/dist ./web/dist
EXPOSE 8787
CMD ["node", "server/dist/index.js"]
