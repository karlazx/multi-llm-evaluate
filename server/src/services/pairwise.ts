import { evaluate } from 'promptfoo';
import { query } from '../db.js';
import { buildProvider, type ModelRow } from './providers.js';

interface CaseRow { id: number; prompt: string; rubric: string | null; }
interface OutRow { case_id: number; model_id: number; raw_output: string | null; }

const MAX_OUTPUT_CHARS = 6000;

/** 解析裁判模型的 JSON 回复：{"winner": "A"|"B"|"tie", "reason": "..."} */
function parseJudgeReply(text: string): { winner: 'A' | 'B' | 'tie'; reason: string } {
  const m = text.match(/\{[\s\S]*?\}/);
  if (m) {
    try {
      const d = JSON.parse(m[0]) as { winner?: string; reason?: string };
      const w = String(d.winner ?? '').toUpperCase();
      if (w === 'A' || w === 'B') return { winner: w, reason: d.reason ?? '' };
      if (w === 'TIE' || w === '平局') return { winner: 'tie', reason: d.reason ?? '' };
    } catch { /* 落到文本启发式 */ }
  }
  // 兜底：文本启发
  if (/输出\s*A\s*更好|A\s*更好|选\s*A|winner.*A/i.test(text)) return { winner: 'A', reason: text.slice(0, 120) };
  if (/输出\s*B\s*更好|B\s*更好|选\s*B|winner.*B/i.test(text)) return { winner: 'B', reason: text.slice(0, 120) };
  return { winner: 'tie', reason: text.slice(0, 120) };
}

function comparisonPrompt(c: CaseRow, outA: string, outB: string): string {
  return `你是资深评审。请根据用例要求与评分细则，比较两个模型的输出，选出更好的一个。

【用例】
${c.prompt}

【评分细则】
${c.rubric ?? '（无，按整体质量判断）'}

【输出 A】
${outA}

【输出 B】
${outB}

只输出 JSON（不要任何多余文字）：{"winner": "A" 或 "B" 或 "tie", "reason": "<一句话理由>"}`;
}

async function judgeOnce(
  judgeSpec: { id: string; config: Record<string, unknown> },
  promptText: string,
): Promise<{ winner: 'A' | 'B' | 'tie'; reason: string }> {
  const r = await evaluate(
    {
      providers: [judgeSpec],
      prompts: [{ label: 'pairwise', raw: promptText }],
    },
    { cache: false },
  );
  const res = (r.results as Array<{ response?: { output?: string } }>)[0];
  return parseJudgeReply(String(res?.response?.output ?? ''));
}

/** 对一轮评测的所有主观/代码题跑 pairwise 对评（AB + BA 位置交换消偏） */
export async function runPairwise(runId: number): Promise<{ pairs: number; judged: number }> {
  const run = (await query('SELECT * FROM eval_runs WHERE id=$1', [runId])).rows[0];
  if (!run) throw new Error(`run ${runId} 不存在`);
  if (run.status !== 'done') throw new Error('评测尚未完成，无法执行 pairwise');

  let judgeModel: ModelRow | null = null;
  if (run.judge_model_id) {
    judgeModel = (await query('SELECT * FROM models WHERE id=$1', [run.judge_model_id])).rows[0] as ModelRow | undefined ?? null;
  }
  if (!judgeModel) {
    judgeModel = (await query("SELECT * FROM models WHERE is_judge=true AND status='active' ORDER BY id LIMIT 1")).rows[0] as ModelRow | undefined ?? null;
  }
  if (!judgeModel) throw new Error('没有可用的裁判模型（指定 judge_model_id 或标记 is_judge）');
  const judgeSpec = buildProvider(judgeModel, { maxTokens: 1024 });

  // 只对有评分细则的主观/代码题做对比
  const cases = (
    await query(`SELECT c.id, c.prompt, c.rubric FROM cases c WHERE c.id = ANY($1::bigint[]) AND c.type <> 'objective' ORDER BY c.id`, [run.case_ids])
  ).rows as CaseRow[];
  const outputs = (
    await query('SELECT case_id, model_id, raw_output FROM run_outputs WHERE run_id=$1 AND raw_output IS NOT NULL', [runId])
  ).rows as OutRow[];

  let pairs = 0;
  let judged = 0;
  for (const c of cases) {
    const outs = outputs.filter((o) => o.case_id === c.id);
    for (let i = 0; i < outs.length; i++) {
      for (let j = i + 1; j < outs.length; j++) {
        pairs++;
        const A = outs[i]; const B = outs[j];
        const a = (A.raw_output ?? '').slice(0, MAX_OUTPUT_CHARS);
        const b = (B.raw_output ?? '').slice(0, MAX_OUTPUT_CHARS);

        // 第一轮：A 在前；第二轮：位置交换（B 在前）
        const r1 = await judgeOnce(judgeSpec, comparisonPrompt(c, a, b));
        const r2 = await judgeOnce(judgeSpec, comparisonPrompt(c, b, a));

        // 折算到原始方向（A=out[i], B=out[j]）
        let winsA = 0; let winsB = 0;
        winsA += r1.winner === 'A' ? 1 : r1.winner === 'tie' ? 0.5 : 0;
        winsB += r1.winner === 'B' ? 1 : r1.winner === 'tie' ? 0.5 : 0;
        // r2 中位置交换：r2.winner==='A' 指的是 B（原方向），==='B' 指的是 A
        winsA += r2.winner === 'B' ? 1 : r2.winner === 'tie' ? 0.5 : 0;
        winsB += r2.winner === 'A' ? 1 : r2.winner === 'tie' ? 0.5 : 0;

        await query(
          `INSERT INTO pairwise_results (run_id, case_id, model_a_id, model_b_id, wins_a, wins_b, reason_ab, reason_ba)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (run_id, case_id, model_a_id, model_b_id)
           DO UPDATE SET wins_a=$5, wins_b=$6, reason_ab=$7, reason_ba=$8`,
          [runId, c.id, A.model_id, B.model_id, winsA, winsB, r1.reason, r2.reason],
        );
        judged++;
      }
    }
  }
  return { pairs, judged };
}

/** 读取一轮的 pairwise 结果（带模型名） */
export async function getPairwise(runId: number) {
  const { rows } = await query(
    `SELECT p.*, c.title AS case_title,
            ma.name AS model_a, mb.name AS model_b,
            COALESCE(ma.display_name, ma.name) AS model_a_display,
            COALESCE(mb.display_name, mb.name) AS model_b_display
     FROM pairwise_results p
     JOIN cases c ON c.id = p.case_id
     JOIN models ma ON ma.id = p.model_a_id
     JOIN models mb ON mb.id = p.model_b_id
     WHERE p.run_id=$1 ORDER BY p.case_id, p.id`,
    [runId],
  );
  return rows;
}
