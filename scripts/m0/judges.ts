// L1 自动判分器（确定性答案）——M0 先落地题2/题3，题1 的规则分在 M2 补齐。
// 每个函数返回 GradingResult：{ pass, score, reason }，可直接作为 promptfoo
// `type: 'javascript'` 断言的值，也可在报告层独立调用（判分与跑测解耦）。
import { create, all } from 'mathjs';

const math = create(all);

export interface GradingResult {
  pass: boolean;
  score: number;
  reason: string;
}

/** 规范化模型输出里可能出现的 LaTeX / 全角 / 符号写法 */
function normalizeMath(text: string): string {
  return text
    // LaTeX 函数 → 纯文本函数（mathjs 可解析）
    .replace(/\\sqrt\s*\{([^{}]*)\}/g, 'sqrt($1)')
    .replace(/\\sqrt\s+(\d+(?:\.\d+)?)/g, 'sqrt($1)')
    .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '((($1)/($2)))')
    .replace(/\\cdot|\\times|\\ast/g, ' * ')
    .replace(/\\div/g, ' / ')
    .replace(/\\boxed\s*\{([^{}]*)\}/g, '$1')
    // LaTeX 定界符 / 残留符号
    .replace(/\\\(|\\\)|\\\[|\\\]|\$/g, ' ')
    .replace(/[\\{}]/g, ' ')
    // Unicode / 全角符号（√ 后跟数字/括号 → sqrt(...)）
    .replace(/√\s*(\d+(?:\.\d+)?)/g, 'sqrt($1)')
    .replace(/√\s*\(([^)]*)\)/g, 'sqrt($1)')
    .replace(/√/g, 'sqrt(')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/\s+/g, ' ');
}

/**
 * 题2 24点：验证输出中的某个表达式恰用 3/4/9/10 各一次、且结果 = 24。
 * 用 mathjs 安全求值（禁止原生 eval）。允许 + - * / ^ sqrt。
 */
export function judge24Point(output: string): GradingResult {
  const norm = normalizeMath(String(output));
  const candidates: string[] = [];

  for (const line of norm.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || !/\d/.test(trimmed)) continue;
    // "a = b" 两边都可能是最终表达式，都纳入候选
    candidates.push(...trimmed.split('=').map((s) => s.trim()));
  }

  for (const raw of candidates) {
    if (!/\d/.test(raw)) continue;
    // 允许字母（sqrt/log 等函数名）与数学符号
    const m = raw.match(/[0-9a-zA-Z_+\-*/^().\s]+/);
    if (!m) continue;
    const expr = m[0].trim();
    if (expr.length < 3) continue;

    let value: number | null = null;
    try {
      const v = math.evaluate(expr);
      if (typeof v === 'number' && Number.isFinite(v)) value = v;
    } catch {
      /* 非法表达式，跳过 */
    }

    if (value !== null && Math.abs(value - 24) < 1e-9) {
      const used = (expr.match(/\d+/g) || []).map(Number).sort((a, b) => a - b);
      if (JSON.stringify(used) === JSON.stringify([3, 4, 9, 10])) {
        return {
          pass: true,
          score: 1,
          reason: `表达式「${expr}」= 24，且恰好使用 3/4/9/10 各一次`,
        };
      }
    }
  }

  return {
    pass: false,
    score: 0,
    reason: '未找到合法表达式：需用 3/4/9/10 各一次且结果等于 24',
  };
}

const PASSWORD_CLUES: Array<{ s: string; cp: number; cw: number }> = [
  { s: '78635', cp: 0, cw: 3 },
  { s: '16384', cp: 1, cw: 1 },
  { s: '56483', cp: 1, cw: 1 },
  { s: '92741', cp: 2, cw: 1 },
  { s: '67153', cp: 2, cw: 2 },
];

/** 统计候选码相对某条线索的：位置正确数 cp、位置错但数字对 cw */
function countClue(code: string, clue: string): { cp: number; cw: number } {
  let cp = 0;
  const codeLeft = new Map<string, number>();
  const clueLeft = new Map<string, number>();
  for (let i = 0; i < 5; i++) {
    if (code[i] === clue[i]) {
      cp++;
    } else {
      codeLeft.set(code[i], (codeLeft.get(code[i]) ?? 0) + 1);
      clueLeft.set(clue[i], (clueLeft.get(clue[i]) ?? 0) + 1);
    }
  }
  let cw = 0;
  for (const [d, cnt] of clueLeft) cw += Math.min(cnt, codeLeft.get(d) ?? 0);
  return { cp, cw };
}

/**
 * 题3 密码锁：从输出中提取 5 位数字串，逐条核对全部约束。
 * 唯一解 12753（已穷举验证），满足全部 5 条线索 = 满分。
 */
export function judgePasswordLock(output: string): GradingResult {
  const codes = String(output).match(/\b\d{5}\b/g) ?? [];
  if (codes.length === 0) {
    return { pass: false, score: 0, reason: '未在输出中提取到 5 位数字串' };
  }

  for (const code of codes) {
    const failures: string[] = [];
    let ok = true;
    for (const clue of PASSWORD_CLUES) {
      const r = countClue(code, clue.s);
      if (r.cp !== clue.cp || r.cw !== clue.cw) {
        ok = false;
        failures.push(`${clue.s}(需cp=${clue.cp}/cw=${clue.cw}，实际cp=${r.cp}/cw=${r.cw})`);
      }
    }
    if (ok) {
      return { pass: true, score: 1, reason: `密码 ${code} 满足全部 5 条线索` };
    }
    if (failures.length > 0) {
      // 记录第一个候选的失败原因，便于报告层穿透
      return {
        pass: false,
        score: 0,
        reason: `候选 ${code} 不满足：${failures.join('；')}`,
      };
    }
  }

  return { pass: false, score: 0, reason: '未找到满足全部线索的 5 位密码' };
}
