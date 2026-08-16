# M0 技术验证报告

> 日期：2026-08-16 ｜ 执行人：本地 Claude Code 助手 ｜ 结论：**M0 主体通过，2 项外部依赖待补**

## 一、验收项核对

| # | 验收点 | 结果 | 说明 |
|---|---|---|---|
| 1 | 初始化项目 + 安装 promptfoo | ✅ | promptfoo 0.122.0（import 库方式）+ mathjs + tsx + TS 全栈 |
| 2 | evaluate() demo（题2/3/4 × 2 模型） | ✅ | 三用例 × OpenAI v1 + Anthropic 两协议，真机跑通 |
| 3 | 三协议各跑通一个模型 | ⚠️ | OpenAI v1 ✅、Anthropic messages ✅；**OpenAI v2（responses）❌ 缺真实 OpenAI key** |
| 4 | llm-rubric 输出结构化评分 | ✅ | 题4 输出 `{pass, score:95, reason}` |
| 5 | 结果对象可读 token/延迟/成本 | ✅ | token（in/out/total/reasoning）、latencyMs 可读；`cost` 字段存在但对未内置定价的模型为 null（M1 配 per-model cost） |
| 6 | 题2/3 确定性答案被 assertions 判对错 | ✅ | 判分器 6 项自测全过（含 LaTeX/Unicode √）；e2e 正确把模型错误答案判 fail |

## 二、关键发现（影响后续设计）

1. **DeepSeek v4 是推理模型**，OpenAI 返回 `reasoning_content`、Anthropic 返回 thinking block。
   - promptfoo 默认 `showThinking=true` 会把思考过程拼进输出（`Thinking: …`），判分前必须 `showThinking:false`。
   - 思考 token 计入 `max_tokens`，会吞掉作答预算导致截断 → 需 `thinking:{type:'disabled'}`（OpenAI 走 `config.passthrough`、Anthropic 走 `config.thinking`）或显著调高 `max_tokens`。
2. **成本字段**：promptfoo 对 `deepseek-v4-*` 无内置定价，`response.cost` 为 null；M1 需按模型配 cost。
3. **模型真实表现**（非平台 bug）：`deepseek-v4-flash` 关闭思考后，题2（24点）与题3（密码锁）均**答错**（长篇试探/被截断），题4（AISniper OS）得分 95。这恰好验证了三级评估里"确定性答案自动判分"的价值。

## 三、待补项（阻塞项，请拍板）

1. **OpenAI v2（responses）协议**：需要一把真实 OpenAI API key（DeepSeek 不提供 Responses API）。给了 key 即可补测 `openai:responses:<model>`。
2. **服务器 SSH 免密登录**：`ssh ubuntu@43.163.231.159` 返回 `Permission denied (publickey)`，本机 id_rsa / id_ed25519 / zhaishuangjian.pem 均被拒，ssh-agent 已失效。M4 部署前需定位正确的私钥或重放 authorized_keys。（此项不阻塞 M0/M1，仅影响 M4 上线）

## 四、产物清单

- `m0/demo.ts` — evaluate() 三用例 × 两协议 demo（含 llm-rubric、javascript 断言、判分器自测）
- `m0/judges.ts` — L1 判分器（题2 24点、题3 密码锁，mathjs 安全求值，禁原生 eval）
- `.env.example` / `.gitignore` / `tsconfig.json` / `LICENSE`(MIT)

## 五、复现方式

```bash
npm install
cp .env.example .env   # 填 DeepSeek key（或沿用本机现有 .env）
npm run m0
```
