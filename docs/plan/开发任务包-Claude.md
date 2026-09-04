---
AIGC:
    Label: "1"
    ContentProducer: 001191110102MACQD9K64018705
    ProduceID: coze_claw/local_download_staging/7674284189394649398/1786856414308722574_开发任务包-Claude.md
    ReservedCode1: ""
    ContentPropagator: 001191110102MACQD9K64028705
    PropagateID: 1291256013533395#1786856415273
    ReservedCode2: ""
---
# 开发任务包 — multi-llm-evaluate（给开发 Agent）

> 本文档是开发执行依据。按阶段（M0→M4）推进，每阶段完成后回报，由小筑（主 Agent）验收，通过才进下一阶段。

---

## 0. 项目一句话

一个"用例驱动 + 多协议 API 跑测 + 三级评估（自动判分 / AI 裁判 / 人工盲评）+ 报告导出"的私有大模型选型评测平台，MIT 开源，后续沉淀为小红书内容数据资产。

## 1. 技术栈（已定，勿改）

- **后端**：Node.js + TypeScript（Fastify）
- **前端**：React + TypeScript（Vite）
- **引擎**：promptfoo（MIT），**以 Node 库方式 import 调用**，不用 CLI subprocess
- **存储**：PostgreSQL（`pg` 驱动；服务器已装实例，直接复用，不用 SQLite）
- **部署**：Docker + GitHub Actions 构建镜像 → 推 registry → SSH 部署 Ubuntu

## 2. 仓库与开发环境

- **仓库**：`git@github.com:karlazx/multi-llm-evaluate.git`（SSH 方式，开发机需已配置 GitHub SSH key）
- **目录结构建议**：
  ```
  /server        # Fastify 后端
    /src
      /cases        # 用例管理
      /models       # 模型接入
      /evals        # 评测编排（封装 promptfoo）
      /judge        # 判分器（L1）
      /report       # 报告聚合
      /blind        # 盲评
    /data          # 本地文件快照目录（gitignore；数据库走 PostgreSQL）
  /web            # React 前端
  /docs           # 使用文档
  docker-compose.yml
  .github/workflows/deploy.yml
  ```

## 3. 分阶段任务与验收

### M0 技术验证（先做，验证可行性）
- 目标：用 promptfoo import 库跑通最小闭环。
- 任务：
  1. 初始化项目，安装 `promptfoo`。
  2. 写一个 `evaluate()` 调用 demo：3 个用例（题2 24点、题3 密码锁、题4 AISniper OS）× 2-3 个模型（OpenAI 兼容 + Anthropic 各至少一个）。
  3. 验证：OpenAI v1(chat completions)、v2(responses)、Anthropic(messages) 三种协议各跑通一个模型。
  4. 验证 llm-rubric 断言能输出结构化评分。
  5. 验证结果对象可读出 token 用量 / 延迟 / 成本字段。
  6. 验证题2/3 的确定性答案能被 assertions 判对错。
- 验收：以上 6 点全通过，贴出结果对象样例。

### M1 用例库 + 模型接入 + 跑测引擎
- 任务：
  1. PostgreSQL schema（见第 5 节）+ 用例 CRUD 接口（连接串走环境变量 DATABASE_URL）。
  2. 模型接入：三协议配置、连接测试接口、key 加密存储（AES，密钥读环境变量）、界面脱敏。
  3. 评测编排：选用例集×模型 → 生成 promptfooconfig → 调 promptfoo 跑测 → 并发控制、单用例失败隔离 → 原始产出全量落盘（JSON 快照）。
  4. 前端：用例 CRUD 页、模型配置页、发起评测页（进度条）。
- 验收：6 个存量用例可录入分类；三协议接入测试通过；并发跑测单用例失败不影响整体；原始产出落盘可追溯。

### M2 自动判分 + AI 裁判 + 报告
- 任务：
  1. 判分器（L1）：实现题 1/2/3 的规则判分（见第 6 节）。
  2. AI 裁判（L2）：llm-rubric 评分细则模板、裁判模型可配置、pairwise 位置交换消偏。
  3. 报告页：总分排行、分维度得分、单用例穿透（原始输出 + AI 评语）、token/费用/耗时看板。
  4. 报告按轮次归档，不覆盖历史。
- 验收：题1/2/3 自动判分正确；题4/5/6 AI 裁判附理由；报告含四大板块；历史可追溯。

### M3 人工盲评 + 产物预览
- 任务：
  1. 盲评页：匿名双栏（隐藏模型名）、投票、ELO 排名、与 AI 分数并列。
  2. 产物预览：iframe 沙箱渲染模型生成的 HTML（题4/5/6）。
  3. 校准面板：AI 分 vs 人工分一致性分析。
  4. 支持"抽样校准"与"全量人工"两种模式切换。
- 验收：盲评匿名、投票回写；HTML 沙箱渲染；一致性可查看；双模式切换。

### M4 打磨 + 导出 + CI/CD 上线
- 任务：
  1. 报告导出 Markdown / PDF。
  2. 增量评测：只跑新模型，并入历史轮次对比。
  3. Dockerfile + docker-compose。
  4. GitHub Actions：构建镜像 → 推 registry → SSH 部署 Ubuntu → 容器启动。
  5. 使用文档（如何录用例、接模型、读报告）。
- 验收：报告可导出；增量评测并入历史；CI 一键部署；文档完整。

## 4. promptfoo 集成规范

- **以库方式调用**：`import { evaluate } from 'promptfoo'`，传入 `promptfooconfig` 对象，拿到 `results`（含 `vars`、`response`、`score`、`latencyMs`、`cost`、`namedScores`）。
- **多协议 provider 配置**：
  - OpenAI v1：`id: 'openai:chat:gpt-xxx'` 或自定义 provider（`config.baseUrl` + `apiKey`）
  - OpenAI v2（responses）：promptfoo 的 responses provider 支持
  - Anthropic：`id: 'anthropic:messages:claude-xxx'`
  - 一律从平台模型接入表读取 endpoint/key/model 动态拼 provider，不硬编码。
- **裁判**：`assert: [{type: 'llm-rubric', value: '<评分细则>'}]`，裁判 provider 可配。
- **确定性判分**：用自定义 assertion（`type: 'python'` 或 JS 函数）承载 L1 判分，或跑测后在报告层用判分器独立算分（推荐后者，判分器与跑测解耦）。

## 5. 数据模型（PostgreSQL）

> 连接串走环境变量 `DATABASE_URL`，启动时跑迁移建表；驱动用 `pg`。下表为规范 DDL（BIGSERIAL 主键、JSONB 存结构化字段、TEXT[] 存标签、TIMESTAMPTZ 记时）。

```sql
CREATE TABLE cases (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  dimension TEXT,            -- 代码|写作|推理|长文本|工具调用|多模态|其他
  type TEXT,                 -- objective | subjective | code
  expected_answer TEXT,
  rubric TEXT,
  assertion_script TEXT,
  source TEXT,               -- self | public
  tags TEXT[],
  status TEXT DEFAULT 'active',
  version INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE models (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT,
  protocol TEXT,             -- openai-v1 | openai-v2 | anthropic
  endpoint TEXT,
  api_key_enc TEXT,          -- AES 加密存储，密钥读环境变量
  default_params JSONB,
  is_judge BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE eval_runs (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  case_set_id BIGINT,
  model_ids BIGINT[],
  judge_model_id BIGINT,
  status TEXT DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  config_json JSONB
);

CREATE TABLE run_outputs (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES eval_runs(id),
  case_id BIGINT NOT NULL REFERENCES cases(id),
  model_id BIGINT NOT NULL REFERENCES models(id),
  raw_output TEXT,
  token_in INT,
  token_out INT,
  latency_ms INT,
  cost_usd NUMERIC(10,6),
  snapshot_json JSONB
);

CREATE TABLE judge_scores (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES eval_runs(id),
  case_id BIGINT NOT NULL REFERENCES cases(id),
  model_id BIGINT NOT NULL REFERENCES models(id),
  score NUMERIC(5,2),
  rubric_text TEXT,
  reason TEXT,
  position INT
);

CREATE TABLE blind_votes (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES eval_runs(id),
  case_id BIGINT NOT NULL REFERENCES cases(id),
  winner_model_id BIGINT,
  loser_model_id BIGINT,
  voter TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE reports (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES eval_runs(id),
  ranking_json JSONB,
  dimension_json JSONB,
  generated_at TIMESTAMPTZ DEFAULT now()
);
```

## 6. 判分器规范（L1，题1/2/3）

**题1 汉字数字造句**（规则可校验部分）：
- 校验输出是否为 10 句；每句结尾依次为 一、二、三、四、五、六、七、八、九、十。
- 校验每句倒数第二个字：不重复，且不含「第」「是」「为」。
- "语句通顺有意义"为主观维度，交给 AI 裁判，判分器只打规则分。

**题2 24点**：
- 提取模型给出的表达式，校验仅使用 3、4、9、10 各一次。
- 用 mathjs 安全求值（`math.evaluate`，禁止原生 `eval`），验证结果 = 24。
- 允许运算符含 + - * / ^ √。

**题3 密码锁**：
- 模型输出应为 5 位数字串。
- 写验证函数校验是否满足全部约束：
  - 78635：恰好 3 个数字正确且位置全错
  - 16384：恰好 1 个数字位置正确、1 个位置错误
  - 56483：恰好 1 个数字位置正确、1 个位置错误
  - 92741：恰好 2 个数字位置正确、1 个位置错误
  - 67153：恰好 2 个数字位置正确、2 个位置错误
- 全满足 = 满分，否则 0 分（答案唯一）。

## 7. 安全与约束（必须遵守）

1. **密钥不进 git**：模型 API key 只存服务器 `.env`（gitignore）；GitHub PAT 用 Actions Secrets，禁止写进代码或 workflow 明文。
2. **判分器禁用原生 eval**：用 mathjs 或白名单表达式求值。
3. **产物预览沙箱隔离**：iframe 用 `sandbox` 属性，禁止模型生成的 HTML 触达宿主环境。
4. **许可证 MIT**：根目录放 LICENSE；promptfoo 依赖 MIT 兼容，无额外义务。
5. **服务器信息、真实 API key 不写入仓库文档**。

## 8. 验收方式

- 每阶段完成后，在群里汇报：交付物清单 + 关键结果样例 + 自测通过的验收项。
- 小筑（主 Agent）逐项核对验收标准，通过后指示进入下一阶段。
- 开发过程中遇到技术卡点（协议不兼容、promptfoo 行为异常等），先尝试自己解决，解决不了在群里说明卡点和已尝试方案。

---

> 本内容由 Coze AI 生成，请遵循相关法律法规及《人工智能生成合成内容标识办法》使用与传播。
