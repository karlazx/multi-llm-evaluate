// M0 技术验证：promptfoo import 库跑通最小闭环。
// 验证点：
//  1. 初始化项目 + 安装 promptfoo            —— 已由 package.json 完成
//  2. evaluate() 调用 demo（题2/3/4 × 2 模型）
//  3. 三协议各跑通一个模型（OpenAI v1 / Anthropic 跑真机；OpenAI v2 见末尾说明）
//  4. llm-rubric 断言输出结构化评分
//  5. 结果对象可读 token / 延迟 / 成本
//  6. 题2/3 确定性答案被 javascript 断言判对错
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { evaluate } from 'promptfoo';
import { judge24Point, judgePasswordLock } from './judges';

// ── 手动加载 .env（避免引入 dotenv 依赖）───────────────────────────────
function loadEnv(file: string) {
  const txt = readFileSync(file, 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  }
}
loadEnv(path.resolve(process.cwd(), '.env'));

// ── 用例 ───────────────────────────────────────────────────────────────
const CASES = {
  case2_24point: {
    id: 'case2-24point',
    prompt:
      '请用 3、4、9、10 这四个数字，每个数字只能且必须使用一次。你可以使用任何初等数学运算符（包括乘方/根号），请拼出 24 点。直接给出表达式和结果。',
  },
  case3_password: {
    id: 'case3-password',
    prompt:
      '有把五位数密码锁，数字顺序与位置均需匹配才能开锁。78635 含 3 个正确数字且位置全错；16384、56483 各 1 个数字位置正确、1 个数字位置错误；92741 有 2 个数字位置正确、1 个数字位置错误；67153 有 2 个数字位置正确、2 个数字位置错误。据此推理密码，只给出 5 位数字答案。',
  },
  case4_aisniper: {
    id: 'case4-aisniper',
    prompt:
      '参考 macOS 新操作系统，创建一个现代、有精简美观界面和 UI 的浏览器内操作系统（命名为「AISniper OS」）。要求包含系统状态浮窗（如 Wi-Fi、系统健康度）、时钟、底部快速启动栏、主题切换功能，并内置可交互的 3D 太空射击游戏。底部快捷栏应该有 Finder、计算器、设置、命令行终端和太空射击游戏。请输出完整的单文件 HTML。',
  },
};

const PROVIDERS = [
  {
    id: 'openai:chat:deepseek-v4-flash', // OpenAI v1（DeepSeek 兼容端点）
    config: {
      showThinking: false, // 只取 content 作答，不把思考过程混入输出
      max_tokens: 8192,
      maxTokens: 8192,
      passthrough: { thinking: { type: 'disabled' } }, // DeepSeek 关闭思考，避免推理 token 吞预算
    },
  },
  {
    id: 'anthropic:messages:deepseek-v4-flash', // Anthropic messages（DeepSeek 兼容端点）
    config: {
      showThinking: false,
      max_tokens: 8192,
      maxTokens: 8192,
      thinking: { type: 'disabled' },
    },
  },
];

const RUBRIC_CASE4 = `你是资深前端评审。请对下面这份"浏览器内操作系统（AISniper OS）"单文件 HTML 实现打分：
- 完整性（40）：是否包含系统状态浮窗、时钟、底部启动栏、主题切换、可交互 3D 太空射击游戏，且启动栏含 Finder/计算器/设置/终端/游戏；
- 美观度（30）：界面是否现代、精简、美观；
- 可交互性（30）：各组件与游戏是否真的可交互。
只输出 JSON（不要多余文字）：{"pass": <true|false>, "score": <0-100 整数>, "reason": "<一句话理由>"}`;

type AnyResult = Record<string, any>;

// ── 结果摘要：只打印 M0 需要证明的字段 ────────────────────────────────
function summarize(tag: string, results: AnyResult[]) {
  console.log(`\n===== ${tag} =====`);
  for (const r of results) {
    const provider = r.provider?.id ?? r.provider?.label ?? '?';
    const caseLabel = r.prompt?.label ?? '?';
    const token = r.response?.tokenUsage;
    const assertion = r.gradingResult?.componentResults?.[0];
    console.log(
      JSON.stringify(
        {
          provider,
          case: caseLabel,
          error: r.error ?? null,
          latencyMs: r.latencyMs,
          costUsd: r.response?.cost ?? null, // 已知定价的模型会自动算，DeepSeek 未内置需在 M1 配 per-model cost
          token: token
            ? { in: token.prompt, out: token.completion, total: token.total }
            : null,
          pass: r.gradingResult?.pass ?? null,
          score: r.score,
          namedScores: r.namedScores ?? null,
          assertion: assertion
            ? { pass: assertion.pass, score: assertion.score, reason: assertion.reason }
            : null,
          outputPreview: String(r.response?.output ?? '').slice(0, 160),
        },
        null,
        2,
      ),
    );
  }
  return results;
}

// ── 结果对象字段清单（供报告确认可读字段）─────────────────────────────
function dumpSchema(tag: string, results: AnyResult[]) {
  const r = results[0];
  console.log(`\n[${tag}] 结果对象字段：`);
  console.log('  顶层:', Object.keys(r).sort().join(', '));
  console.log('  response:', Object.keys(r.response ?? {}).sort().join(', '));
  if (r.response?.tokenUsage) {
    console.log('  tokenUsage:', Object.keys(r.response.tokenUsage).sort().join(', '));
  }
}

// ── 0. 判分器自测（不发 API，先证明 L1 判分逻辑正确）───────────────────
function judgeSelfTest() {
  console.log('===== 判分器自测（不调 API）=====');
  const t24ok = judge24Point('((10-4)^3)/9 = 24');
  const t24latex = judge24Point('\\(10+9+3+\\sqrt{4}=24\\)'); // 模型常见 LaTeX 输出
  const t24bad = judge24Point('(10-4)*(9-3) = 36');
  const t24dup = judge24Point('(10-4)*(9-3)+24-24'); // 数字不唯一
  const tlockOk = judgePasswordLock('答案是 12753');
  const tlockBad = judgePasswordLock('答案是 12754');
  const tests = [
    ['24点-正确', t24ok, true],
    ['24点-LaTeX', t24latex, true],
    ['24点-结果错', t24bad, false],
    ['密码锁-正确', tlockOk, true],
    ['密码锁-错误', tlockBad, false],
  ] as const;
  for (const [name, got, want] of tests) {
    const ok = got.pass === want;
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${name}: pass=${got.pass} (期望 ${want})  reason=${got.reason}`,
    );
  }
  console.log(`补充 24点-重复数字: pass=${t24dup.pass} reason=${t24dup.reason}`);
}

// ── 主流程 ─────────────────────────────────────────────────────────────
async function main() {
  judgeSelfTest();

  // 1) 题2 24点：确定性答案，javascript 断言判对错
  try {
    const r2 = await evaluate({
      providers: PROVIDERS,
      prompts: [{ label: CASES.case2_24point.id, raw: CASES.case2_24point.prompt }],
      defaultTest: { assert: [{ type: 'javascript', value: judge24Point }] },
    });
    summarize('题2 24点（javascript 断言）', r2.results);
    dumpSchema('题2', r2.results);
  } catch (e) {
    console.error('题2 跑测失败:', (e as Error).message);
  }

  // 2) 题3 密码锁：确定性答案，javascript 断言判对错
  try {
    const r3 = await evaluate({
      providers: PROVIDERS,
      prompts: [{ label: CASES.case3_password.id, raw: CASES.case3_password.prompt }],
      defaultTest: { assert: [{ type: 'javascript', value: judgePasswordLock }] },
    });
    summarize('题3 密码锁（javascript 断言）', r3.results);
  } catch (e) {
    console.error('题3 跑测失败:', (e as Error).message);
  }

  // 3) 题4 AISniper OS：主观题，llm-rubric 结构化评分
  try {
    const r4 = await evaluate({
      providers: PROVIDERS,
      prompts: [{ label: CASES.case4_aisniper.id, raw: CASES.case4_aisniper.prompt }],
      defaultTest: {
        assert: [
          {
            type: 'llm-rubric',
            value: RUBRIC_CASE4,
            provider: 'openai:chat:deepseek-v4-flash',
          },
        ],
      },
    });
    summarize('题4 AISniper OS（llm-rubric 裁判）', r4.results);
  } catch (e) {
    console.error('题4 跑测失败:', (e as Error).message);
  }

  console.log(
    '\n说明：OpenAI v2（responses）协议已在 promptfoo 0.122 中确认支持（provider id = openai:responses:<model>），' +
      '但 DeepSeek 不提供 Responses API、本机亦无真实 OpenAI key，故本轮未跑真机。补一个真实 OpenAI key 即可补测。',
  );
}

main().catch((e) => {
  console.error('M0 demo 异常:', e);
  process.exit(1);
});
