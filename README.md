# multi-llm-evaluate

一个「用例驱动 + 多协议 API 跑测 + 三级评估（自动判分 / AI 裁判 / 人工盲评）+ 报告导出」的私有大模型选型评测平台。MIT 开源。

## 技术栈

- 后端：Node.js + TypeScript（Fastify）
- 前端：React + TypeScript（Vite）
- 评测引擎：promptfoo（MIT，import 库方式）
- 存储：PostgreSQL（`pg` 驱动）
- 部署：Docker + GitHub Actions → GHCR → SSH 部署 Ubuntu

## 本地开发

```bash
npm install
cp .env.example .env        # 填 DATABASE_URL / ENCRYPTION_KEY / 各模型 key

# 数据库迁移 + 录入 6 个存量用例
npm run seed

# 起后端（:8787）
npm run server

# 起前端 dev（:5173，/api 代理到后端）
npm run web:dev
```

打开 http://localhost:5173

## 使用流程

### 1. 录用例（「用例库」页）
- 新建：标题、prompt、维度（代码/写作/推理/长文本/工具调用/多模态/其他）、类型（objective 客观 / subjective 主观 / code 代码）。
- 客观题填「期望答案」或判分脚本；主观/代码题填「评分细则」。
- 停用不删（软删，历史报告不受影响）。

### 2. 接模型（「模型接入」页）
- 填：API 模型名、协议（openai-v1 / openai-v2 / anthropic）、endpoint、key、单价（$/1M tokens）、思考模式。
- **key 加密存储**（AES-256-GCM），界面只显示脱敏值；编辑留空不更新。
- 点「测试连接」验证三协议真机连通。

### 3. 发起评测（「发起评测」页）
- 勾选用例 × 模型 → 发起，进度条轮询，结果表含延迟 / token / 成本 / 输出预览。

### 4. 读报告（「报告」页）
- 四大板块：总分排行、分维度得分、成本看板、单用例穿透。
- 「导出 Markdown」下载；「对比历史」跨轮次合并（增量评测：新模型单独跑，再并入历史一起看）。

### 5. 人工盲评（「人工盲评」页）
- 匿名 A/B 双栏投票 → ELO 排名；代码题可沙箱 iframe 预览 HTML；校准面板看 AI vs 人工一致性。
- 支持「抽样校准 / 全量人工」切换。

## 三级评估体系

| 层级 | 适用 | 机制 |
|---|---|---|
| L1 自动判分 | 客观题（造句/24点/密码锁） | Node 规则判分（mathjs 安全求值，禁原生 eval） |
| L2 AI 裁判 | 主观/代码题 | llm-rubric + 可配置裁判模型 |
| L3 人工盲评 | 全量/抽样 | 匿名 A/B 投票 + ELO + 校准 |

## 部署（Docker + CI/CD）

### 镜像

```bash
docker build -t multi-llm-evaluate .
docker run -d -p 8787:8787 \
  --add-host host.docker.internal:host-gateway \
  -e DATABASE_URL='postgres://user:pass@host.docker.internal:5432/llm_evaluate' \
  -e ENCRYPTION_KEY='<64位hex>' \
  multi-llm-evaluate
```

### GitHub Actions 一键部署

`.github/workflows/deploy.yml`：push main → 构建镜像 → 推 GHCR → SSH 部署。

需在仓库 Settings → Secrets 配置：

| Secret | 说明 |
|---|---|
| `SSH_HOST` | 服务器地址（如 your-server-ip） |
| `SSH_USER` | 服务器用户（如 ubuntu） |
| `SSH_KEY` | SSH 私钥（用于免密登录） |
| `GH_PAT` | 带 `read:packages` 的 PAT（服务器拉取私有镜像用） |
| `DATABASE_URL` | 容器内连宿主机 PG：`postgres://…@host.docker.internal:5432/…` |
| `ENCRYPTION_KEY` | AES-256-GCM 密钥（64 位 hex） |

## 安全约束

- 模型 key 只存服务器（AES 加密 + `.env` gitignore），GitHub 用 Secrets。
- 判分器用 mathjs，禁用原生 eval。
- 产物预览 `iframe sandbox="allow-scripts"`（无 `allow-same-origin`），模型 HTML 触达不到宿主。
- MIT 许可证。

## 目录结构

```
server/   # Fastify 后端（src/routes、src/services、src/migrations）
web/      # React 前端（src/pages：用例/模型/评测/报告/盲评）
m0/       # M0 技术验证 demo
docs/     # 阶段报告
```
