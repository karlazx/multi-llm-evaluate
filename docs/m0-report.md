# M0 技术验证报告

> 日期：2026-08-16 ｜ 执行人：本地 Claude Code 助手 ｜ 结论：**M0 全部验收点通过**

## 一、验收项核对

| # | 验收点 | 结果 | 说明 |
|---|---|---|---|
| 1 | 初始化项目 + 安装 promptfoo | ✅ | promptfoo 0.122.0（import 库方式）+ mathjs + tsx + TS 全栈 |
| 2 | evaluate() demo（题2/3/4 × 2 模型） | ✅ | 三用例 × OpenAI v1 + Anthropic 两协议，真机跑通 |
| 3 | 三协议各跑通一个模型 | ✅ | OpenAI v1（DeepSeek 直连）✅、OpenAI v2（胜算云中转 responses）✅、Anthropic messages（DeepSeek /anthropic）✅ |
| 4 | llm-rubric 输出结构化评分 | ✅ | 题4 输出 `{pass, score:95, reason}` |
| 5 | 结果对象可读 token/延迟/成本 | ✅ | token（in/out/total/reasoning）、latencyMs 可读；`cost` 字段存在——胜算云 responses 返回 `usage.cost`，DeepSeek 直连无内置定价→null（M1 配 per-model cost） |
| 6 | 题2/3 确定性答案被 assertions 判对错 | ✅ | 判分器 6 项自测全过（含 LaTeX/√）；e2e 正确把模型错误答案判 fail |

## 二、关键发现（影响后续设计）

1. **DeepSeek v4 是推理模型**（OpenAI 返回 `reasoning_content`、Anthropic 返回 thinking block）：
   - promptfoo 默认 `showThinking=true` 会把思考拼进输出污染判分 → 需 `showThinking:false`。
   - 思考 token 计入 `max_tokens` 吞作答预算 → 需 `thinking:{type:'disabled'}`（OpenAI 走 `config.passthrough`、Anthropic 走 `config.thinking`）或调高 `max_tokens`。
   - **建议 M1 把「开/关思考」做成模型接入的可配置开关**——它本身就是评测对比的一个维度。
2. **胜算云中转**：OpenAI 兼容网关，193 模型（OpenAI/Anthropic/Google/DeepSeek/Qwen/豆包…），支持 `/v1/chat/completions`、`/v1/messages`、`/v1/responses`。模型名带厂商前缀（如 `openai/gpt-4o-mini`、`deepseek/deepseek-v4-pro`）。**这是平台接多家模型的一把钥匙**，M1 的模型接入层按「中转网关 + 直连」两种方式设计。
3. **成本字段**：胜算云 responses 返回 `usage.cost` 可读；DeepSeek 直连在 promptfoo 无定价，`cost=null`，M1 需按模型配 cost。
4. **模型真实表现**（非平台 bug）：`deepseek-v4-flash` 关思考后题2/3 答错、题4 得 95——验证了三级评估里「确定性答案自动判分」的价值。

## 三、环境与凭据

- DeepSeek 直连：`OPENAI_*` / `ANTHROPIC_*`（走 `.env`，gitignore）。
- 胜算云：`SSY_API_KEY` / `SSY_BASE_URL`（`.env`）。
- 服务器：`ubuntu@43.163.231.159`，SSH 免密已通，PostgreSQL 14.20 已装（M1 起用）。

## 四、产物清单

- `m0/demo.ts` — 三协议冒烟 + 三用例 × 两协议 demo（llm-rubric / javascript 断言 / 判分器自测）
- `m0/judges.ts` — L1 判分器（题2 24点、题3 密码锁，mathjs 安全求值，禁原生 eval，支持 LaTeX/√）
- `.env.example` / `.gitignore` / `tsconfig.json` / `LICENSE`(MIT)

## 五、复现方式

```bash
npm install
cp .env.example .env   # 填 DeepSeek key + 胜算云 key（或沿用本机现有 .env）
npm run m0
```
