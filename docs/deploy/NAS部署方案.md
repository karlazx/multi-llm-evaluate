# 大模型评测平台 — NAS Docker 部署方案

## 部署概览

| 项目 | 值 |
|------|-----|
| 目标设备 | 极空间 Z4Pro（192.168.31.251） |
| 访问地址 | http://192.168.31.251:8788 |
| 访问范围 | 仅局域网 |
| 镜像来源 | GHCR（GitHub Container Registry），CI 自动构建 |
| 数据库 | NAS 上新装 PostgreSQL 16 容器 |
| 数据持久化 | Docker volume（NAS 本地存储） |

## 架构

```
┌─────────────────── NAS (192.168.31.251) ───────────────────┐
│                                                              │
│  ┌─────────────────┐     ┌──────────────────────────────┐  │
│  │  PostgreSQL 16   │◄────│  multi-llm-evaluate (app)    │  │
│  │  :5432 (内部)     │     │  :8788 → 8787                │  │
│  │  vol: mle-pg-data │     │  vol: mle-app-data           │  │
│  └─────────────────┘     └──────────────────────────────┘  │
│           ▲                          │                       │
│           │   Docker network: mle-net│                       │
│           └──────────────────────────┘                       │
│                                      │                       │
└──────────────────────────────────────┼───────────────────────┘
                                       │ 出站 HTTPS
                                       ▼
                              模型 API（DeepSeek/胜算云等）
```

## 文件清单

部署需要在 NAS 上创建一个目录（如 `/docker/mle/`），包含以下文件：

```
/docker/mle/
├── docker-compose.yml    # 编排文件
├── .env                  # 环境变量（敏感，不提交 git）
└── data/
    ├── pg/               # PostgreSQL 数据目录
    └── snapshots/        # 评测快照目录（可选）
```

---

## 文件内容

### 1. docker-compose.yml

```yaml
version: "3.8"

services:
  db:
    image: postgres:16-alpine
    container_name: mle-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: mle
      POSTGRES_USER: mle
      POSTGRES_PASSWORD: ${PG_PASSWORD}
    volumes:
      - ./data/pg:/var/lib/postgresql/data
    networks:
      - mle-net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mle"]
      interval: 5s
      timeout: 3s
      retries: 10

  app:
    image: ghcr.io/karlazx/multi-llm-evaluate:latest
    container_name: mle-app
    restart: unless-stopped
    ports:
      - "8788:8787"
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://mle:${PG_PASSWORD}@db:5432/mle
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}
      # ── 模型 API 配置（复用 Ubuntu 的 key）──
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      OPENAI_BASE_URL: ${OPENAI_BASE_URL}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      ANTHROPIC_AUTH_TOKEN: ${ANTHROPIC_AUTH_TOKEN}
      ANTHROPIC_BASE_URL: ${ANTHROPIC_BASE_URL}
      SSY_API_KEY: ${SSY_API_KEY}
      SSY_BASE_URL: ${SSY_BASE_URL}
    volumes:
      - ./data/snapshots:/app/data/snapshots
    depends_on:
      db:
        condition: service_healthy
    networks:
      - mle-net

networks:
  mle-net:
    driver: bridge
```

### 2. .env 模板

```bash
# ══ NAS 部署环境变量 ══
# 复制为 .env 并填入真实值

# ── PostgreSQL 密码 ──
PG_PASSWORD=<生成一个强密码，如: 自定义强密码>

# ── 加密密钥（64位 hex = 32字节）──
# 生成方式: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# 注意：如果要从 Ubuntu 迁移已加密的模型 key，必须用相同的 ENCRYPTION_KEY
# 如果是全新部署，生成新的即可
ENCRYPTION_KEY=<64位hex字符串>

# ── 模型 API 配置（从 Ubuntu 服务器 .env 复制）──
# DeepSeek 直连
OPENAI_API_KEY=sk-xxxx
OPENAI_BASE_URL=https://api.deepseek.com/v1
ANTHROPIC_API_KEY=sk-xxxx
ANTHROPIC_AUTH_TOKEN=sk-xxxx
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic

# 胜算云中转
SSY_API_KEY=apk-xxxx
SSY_BASE_URL=https://router.shengsuanyun.com/api/v1
```

---

## 部署步骤

### Step 1：在 NAS 上创建目录结构

SSH 登录 NAS（或通过 NAS 终端）：

```bash
ssh <nas-user>@192.168.31.251

# 创建部署目录
mkdir -p /docker/mle/data/pg
mkdir -p /docker/mle/data/snapshots
```

### Step 2：上传配置文件

将 `docker-compose.yml` 和 `.env` 上传到 `/docker/mle/` 目录。

### Step 3：生成 ENCRYPTION_KEY

```bash
# 在 NAS 上执行（需要 node）
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 或者在本地 Mac 上生成后复制过去
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

将生成的 64 位 hex 字符串填入 `.env` 的 `ENCRYPTION_KEY`。

### Step 4：登录 GHCR 并拉取镜像

```bash
# 登录 GitHub Container Registry
# 需要一个 GitHub PAT（有 read:packages 权限）
echo "<GH_PAT>" | docker login ghcr.io -u karlazx --password-stdin

# 拉取最新镜像
docker pull ghcr.io/karlazx/multi-llm-evaluate:latest
```

### Step 5：启动服务

```bash
cd /docker/mle
docker compose up -d
```

### Step 6：验证

```bash
# 检查容器状态
docker compose ps

# 检查日志
docker compose logs -f app

# 健康检查
curl http://localhost:8788/api/health
# 应返回: {"ok":true,"ts":...}
```

### Step 7：初始化数据

```bash
# 录入种子用例（6 个预置评估用例）
docker exec mle-app npx tsx server/src/seed.ts
```

### Step 8：浏览器访问

打开 http://192.168.31.251:8788 ，应该能看到评测平台界面。

### Step 9：录入模型

在 Web UI 的「模型管理」页面手动录入模型（和 Ubuntu 一样），或通过 API 添加。

需要录入的 5 个模型：
1. deepseek-v4-flash（DeepSeek 直连，openai-v1）
2. deepseek-v4-pro（DeepSeek 直连，openai-v1）
3. gpt-4o-mini（胜算云，openai-v1）
4. claude-sonnet-4.5（胜算云，anthropic）
5. 裁判模型（根据需要配置）

---

## 关于 ENCRYPTION_KEY 的选择

| 场景 | ENCRYPTION_KEY |
|------|---------------|
| **全新部署**（推荐） | 生成新的 64 位 hex，模型 key 重新录入 |
| **从 Ubuntu 迁移数据库** | 必须用 Ubuntu 相同的 key，否则无法解密已存的 API key |

由于模型数据不在 git 中，NAS 上是全新数据库，建议直接生成新的 ENCRYPTION_KEY，模型信息在 Web UI 重新录入。

---

## 关于模型 Key 的复用方式

用户确认「复用 Ubuntu 的 key」，有两种理解：

**方案 A（推荐）：.env 里配相同的 API key 值**
- NAS 的 `.env` 填入和 Ubuntu 相同的 API key
- 在 Web UI 添加模型时，系统会用 NAS 的 ENCRYPTION_KEY 加密后存入 NAS 的 PG
- 两套环境独立，互不影响

**方案 B：迁移 Ubuntu 数据库**
- 需要相同的 ENCRYPTION_KEY
- 会连同用例、评测历史一起迁移
- 不推荐（评测历史是 Ubuntu 环境的，NAS 应该从头开始）

**推荐方案 A**：.env 里配相同的 API key 值，数据库全新开始。

---

## 后续维护

### 更新镜像

```bash
cd /docker/mle
docker pull ghcr.io/karlazx/multi-llm-evaluate:latest
docker compose up -d    # 自动替换旧容器
```

### 备份数据库

```bash
docker exec mle-postgres pg_dump -U mle mle > backup_$(date +%Y%m%d).sql
```

### 查看日志

```bash
docker compose logs -f app     # 应用日志
docker compose logs -f db      # 数据库日志
```

### 停止服务

```bash
cd /docker/mle
docker compose down
```

---

## 风险与注意事项

1. **极空间 Docker 兼容性**：极空间的 Docker 管理界面可能和标准 docker-compose 有差异，如果 NAS 自带 UI 管理 Docker，可能需要通过其 UI 导入 compose 文件
2. **PG 数据目录权限**：`./data/pg` 目录需要确保 PostgreSQL 容器有读写权限
3. **NAS 休眠**：如果 NAS 有硬盘休眠策略，Docker 容器会保持磁盘活跃
4. **内网穿透**：当前方案仅支持局域网访问，如需外网访问需额外配置（frp/Cloudflare Tunnel 等）
