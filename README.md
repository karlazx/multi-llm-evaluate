# multi-llm-evaluate

一个「用例驱动 + 多协议 API 跑测 + 三级评估（自动判分 / AI 裁判 / 人工盲评）+ 报告导出」的私有大模型选型评测平台。MIT 开源。

## 技术栈

- 后端：Node.js + TypeScript（Fastify）
- 前端：React + TypeScript（Vite）
- 评测引擎：promptfoo（MIT，import 库方式）
- 存储：PostgreSQL（`pg` 驱动）
- 部署：Docker（家庭 NAS，局域网）；GitHub Actions 只负责构建镜像推 GHCR

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
docker run -d --name multi-llm-evaluate --network host \
  -e DATABASE_URL='postgres://user:pass@127.0.0.1:5432/llm_evaluate' \
  -e ENCRYPTION_KEY='<64位hex>' \
  -e HOST=0.0.0.0 \
  multi-llm-evaluate
```

### GitHub Actions 构建（NAS-only 部署）

> 自 2026-09-05 起，生产环境只跑在家庭 NAS（`192.168.31.251:8788`）。
> 云服务器部署已退役。

`.github/workflows/deploy.yml`：push main → 构建镜像 → 推送 GHCR（`ghcr.io/karlazx/multi-llm-evaluate:latest`）。

CI 不再 SSH 到任何服务器；NAS 在局域网内手动拉取更新：

```bash
# 在 NAS 的部署目录（含 docker-compose.yml）
docker login ghcr.io -u <用户名>          # 用带 read:packages 的 PAT
docker compose pull app
docker compose up -d app
```

详见 [`deploy/nas/README.md`](deploy/nas/README.md)。

### NAS 部署（局域网）

家庭 NAS（双容器 mle-app + mle-postgres，端口 8788）的部署文件与说明见
[`deploy/nas/`](deploy/nas/)，方案细节见 [`docs/deploy/NAS部署方案.md`](docs/deploy/NAS部署方案.md)。

## 安全约束

- 模型 key 只存服务器（AES 加密 + `.env` gitignore），GitHub 用 Secrets。
- 判分器用 mathjs，禁用原生 eval。
- 产物预览 `iframe sandbox="allow-scripts"`（无 `allow-same-origin`），模型 HTML 触达不到宿主。
- MIT 许可证。

## 目录结构

```
server/           # Fastify 后端（src/routes、src/services、src/migrations）
web/              # React 前端（src/pages：用例/模型/评测/报告/盲评）
scripts/m0/       # M0 技术验证 demo（三协议冒烟 + 判分器样例，历史存档）
deploy/nas/       # NAS 局域网部署（双容器 compose + 部署脚本）
docs/
├── plan/         # 立项：可行性分析、落地方案、市场调研、开发任务包
├── acceptance/   # 验收：M0-M4 验收记录、UAT 报告
├── deploy/       # 部署方案（NAS）
├── assets/       # 素材：评测题集、模型单价清单
├── m0-report.md  # M0 阶段报告
└── private/      # 本地私密运维文档（含真实凭据，.gitignore 屏蔽，不入库）
data/snapshots/   # 运行时产物：每轮评测的原始输出 JSON 快照（非文档，.gitignore 屏蔽）
```
