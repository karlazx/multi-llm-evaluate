// L1 自动判分器（确定性答案）——题1/2/3。mathjs 安全求值，禁原生 eval。
import { create, all } from 'mathjs';

const math = create(all);

export interface GradingResult {
  pass: boolean;
  score: number;
  reason: string;
}

/** 规范化 LaTeX / 全角 / 符号写法 */
function normalizeMath(text: string): string {
  return text
    .replace(/\\sqrt\s*\{([^{}]*)\}/g, 'sqrt($1)')
    .replace(/\\sqrt\s+(\d+(?:\.\d+)?)/g, 'sqrt($1)')
    .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '((($1)/($2)))')
    .replace(/\\cdot|\\times|\\ast/g, ' * ')
    .replace(/\\div/g, ' / ')
    .replace(/\\boxed\s*\{([^{}]*)\}/g, '$1')
    .replace(/\\\(|\\\)|\\\[|\\\]|\$/g, ' ')
    .replace(/[\\{}]/g, ' ')
    .replace(/√\s*(\d+(?:\.\d+)?)/g, 'sqrt($1)')
    .replace(/√\s*\(([^)]*)\)/g, 'sqrt($1)')
    .replace(/√/g, 'sqrt(')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/\s+/g, ' ');
}

/** 题2 24点：表达式恰用 3/4/9/10 各一次且 = 24 */
export function judge24Point(output: string): GradingResult {
  const norm = normalizeMath(String(output));
  const candidates: string[] = [];
  for (const line of norm.split('\n')) {
    const t = line.trim();
    if (!t || !/\d/.test(t)) continue;
    candidates.push(...t.split('=').map((s) => s.trim()));
  }
  for (const raw of candidates) {
    if (!/\d/.test(raw)) continue;
    const m = raw.match(/[0-9a-zA-Z_+\-*/^().\s]+/);
    if (!m) continue;
    const expr = m[0].trim();
    if (expr.length < 3) continue;
    let v: number | null = null;
    try {
      const val = math.evaluate(expr);
      if (typeof val === 'number' && Number.isFinite(val)) v = val;
    } catch {
      /* 非法表达式 */
    }
    if (v !== null && Math.abs(v - 24) < 1e-9) {
      const used = (expr.match(/\d+/g) || []).map(Number).sort((a, b) => a - b);
      if (JSON.stringify(used) === JSON.stringify([3, 4, 9, 10])) {
        return { pass: true, score: 1, reason: `表达式「${expr}」= 24，且恰好使用 3/4/9/10 各一次` };
      }
    }
  }
  return { pass: false, score: 0, reason: '未找到合法表达式：需用 3/4/9/10 各一次且结果等于 24' };
}

const PASSWORD_CLUES: Array<{ s: string; cp: number; cw: number }> = [
  { s: '78635', cp: 0, cw: 3 },
  { s: '16384', cp: 1, cw: 1 },
  { s: '56483', cp: 1, cw: 1 },
  { s: '92741', cp: 2, cw: 1 },
  { s: '67153', cp: 2, cw: 2 },
];

function countClue(code: string, clue: string): { cp: number; cw: number } {
  let cp = 0;
  const codeLeft = new Map<string, number>();
  const clueLeft = new Map<string, number>();
  for (let i = 0; i < 5; i++) {
    if (code[i] === clue[i]) cp++;
    else {
      codeLeft.set(code[i], (codeLeft.get(code[i]) ?? 0) + 1);
      clueLeft.set(clue[i], (clueLeft.get(clue[i]) ?? 0) + 1);
    }
  }
  let cw = 0;
  for (const [d, cnt] of clueLeft) cw += Math.min(cnt, codeLeft.get(d) ?? 0);
  return { cp, cw };
}

/** 题3 密码锁：唯一解 12753，逐条核对 5 条线索 */
export function judgePasswordLock(output: string): GradingResult {
  const codes = String(output).match(/\b\d{5}\b/g) ?? [];
  if (!codes.length) return { pass: false, score: 0, reason: '未在输出中提取到 5 位数字串' };
  for (const code of codes) {
    const fails: string[] = [];
    let ok = true;
    for (const c of PASSWORD_CLUES) {
      const r = countClue(code, c.s);
      if (r.cp !== c.cp || r.cw !== c.cw) {
        ok = false;
        fails.push(`${c.s}(需cp=${c.cp}/cw=${c.cw}，实际cp=${r.cp}/cw=${r.cw})`);
      }
    }
    if (ok) return { pass: true, score: 1, reason: `密码 ${code} 满足全部 5 条线索` };
    if (fails.length) {
      return { pass: false, score: 0, reason: `候选 ${code} 不满足：${fails.join('；')}` };
    }
  }
  return { pass: false, score: 0, reason: '未找到满足全部线索的 5 位密码' };
}

const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/** 题1 汉字数字造句（规则分部分）：10 句、结尾一到十、倒数第二字不重复且不含第/是/为 */
export function judgeSentence(output: string): GradingResult {
  const lines = String(output)
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const sentences = lines.length >= 10 ? lines : lines[0]?.split(/[。；;]/).map((s) => s.trim()).filter(Boolean) ?? [];

  if (sentences.length !== 10) {
    return { pass: false, score: 0, reason: `应输出 10 句，实际提取到 ${sentences.length} 句` };
  }
  const penult: string[] = [];
  for (let i = 0; i < 10; i++) {
    const s = sentences[i];
    if (!s.endsWith(CN_NUM[i])) {
      return { pass: false, score: 0, reason: `第 ${i + 1} 句结尾应为「${CN_NUM[i]}」` };
    }
    if (s.length < 2) {
      return { pass: false, score: 0, reason: `第 ${i + 1} 句过短，无倒数第二个字` };
    }
    const p = s[s.length - 2];
    if (p === '第' || p === '是' || p === '为') {
      return { pass: false, score: 0, reason: `第 ${i + 1} 句倒数第二个字不能是「${p}」` };
    }
    penult.push(p);
  }
  if (new Set(penult).size !== 10) {
    return { pass: false, score: 0, reason: `倒数第二个字有重复：${penult.join('')}` };
  }
  return { pass: true, score: 1, reason: '10 句结构合规：结尾一到十、倒数第二字不重复且不含第/是/为' };
}

/** 按 case.assertion_script 名称返回对应 L1 判分器；未知返回 null（走 AI 裁判） */
export function l1JudgeByName(name: string | null): ((output: string) => GradingResult) | null {
  switch (name) {
    case 'judgeSentence':
      return judgeSentence;
    case 'judge24Point':
      return judge24Point;
    case 'judgePasswordLock':
      return judgePasswordLock;
    default:
      return null;
  }
}

export const L1_JUDGES = { judge24Point, judgePasswordLock, judgeSentence };
