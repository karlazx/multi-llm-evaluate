import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { evaluate } from 'promptfoo';
import { config } from '../config.js';
import { query } from '../db.js';
import { buildProvider, calcCost, type ModelRow } from './providers.js';
import { l1JudgeByName } from './judge.js';

interface CaseRow {
  id: number;
  title: string;
  prompt: string;
  type: string;
  dimension: string | null;
  rubric: string | null;
  assertion_script: string | null;
}

// 代码题生成整页 HTML/JS，token 需求大；客观/主观题用较小上限
function maxTokensFor(type: string): number {
  return type === 'code' ? 16384 : 4096;
}

/** 按用例 type 组装断言：客观题 → L1 javascript 判分；主观/代码题 → L2 llm-rubric */
function buildAssertions(c: CaseRow, judgeProvider: { id: string; config: Record<string, unknown> } | null) {
  const l1 = l1JudgeByName(c.assertion_script);
  if (l1) return [{ type: 'javascript' as const, value: l1 }];
  if (c.rubric && judgeProvider) {
    return [{ type: 'llm-rubric' as const, value: c.rubric, provider: judgeProvider }];
  }
  return [];
}

async function resolveJudgeModel(run: { judge_model_id?: number | null }): Promise<ModelRow | null> {
  if (run.judge_model_id) {
    const { rows } = await query('SELECT * FROM models WHERE id=$1', [run.judge_model_id]);
    if (rows[0]) return rows[0] as ModelRow;
  }
  const { rows } = await query("SELECT * FROM models WHERE is_judge=true AND status='active' ORDER BY id LIMIT 1");
  return (rows[0] as ModelRow) ?? null;
}

/** 跑一轮评测：每个用例一次 evaluate（所有模型一起跑），L1/L2 断言在跑测中判分 */
export async function runEval(runId: number): Promise<void> {
  const run = (await query('SELECT * FROM eval_runs WHERE id=$1', [runId])).rows[0];
  if (!run) throw new Error(`run ${runId} 不存在`);
  const caseIds: number[] = run.case_ids ?? [];
  const modelIds: number[] = run.model_ids ?? [];

  const cases = (await query('SELECT * FROM cases WHERE id = ANY($1::bigint[]) ORDER BY id', [caseIds])).rows as CaseRow[];
  const models = (await query('SELECT * FROM models WHERE id = ANY($1::bigint[]) ORDER BY id', [modelIds])).rows as ModelRow[];
  const judgeModel = await resolveJudgeModel(run);

  // 需要 L2 却没有裁判模型 → 提前失败
  const needJudge = cases.some((c) => !l1JudgeByName(c.assertion_script) && c.rubric);
  if (needJudge && !judgeModel) {
    await query("UPDATE eval_runs SET status='failed' WHERE id=$1", [runId]);
    throw new Error('存在主观/代码题但没有可用的裁判模型（is_judge=true 或指定 judge_model_id）');
  }
  const judgeProvider = judgeModel ? buildProvider(judgeModel, { maxTokens: 4096 }) : null;

  await query("UPDATE eval_runs SET status='running', started_at=now() WHERE id=$1", [runId]);
  const snapDir = path.join(config.snapshotDir, String(runId));
  mkdirSync(snapDir, { recursive: true });

  const caseConcurrency = 2;
  for (let i = 0; i < cases.length; i += caseConcurrency) {
    const batch = cases.slice(i, i + caseConcurrency);
    await Promise.all(
      batch.map((c) =>
        runOneCase(runId, c, models, judgeProvider, snapDir).catch(async (e) => {
          for (const m of models) {
            await query(
              `INSERT INTO run_outputs (run_id, case_id, model_id, raw_output, snapshot_json)
               VALUES ($1,$2,$3,$4,$5)`,
              [runId, c.id, m.id, null, JSON.stringify({ error: (e as Error).message })],
            );
          }
        }),
      ),
    );
  }

  await query("UPDATE eval_runs SET status='done', finished_at=now() WHERE id=$1", [runId]);
}

async function runOneCase(
  runId: number,
  c: CaseRow,
  models: ModelRow[],
  judgeProvider: { id: string; config: Record<string, unknown> } | null,
  snapDir: string,
): Promise<void> {
  const maxTokens = maxTokensFor(c.type);
  const providerSpecs = models.map((m) => ({ model: m, spec: buildProvider(m, { maxTokens }) }));
  const assertions = buildAssertions(c, judgeProvider);

  const r = await evaluate({
    providers: providerSpecs.map((p) => p.spec),
    prompts: [{ label: `case:${c.id}`, raw: c.prompt }],
    defaultTest: { assert: assertions },
  });

  for (const res of r.results as any[]) {
    const spec = providerSpecs.find((p) => p.spec.id === res.provider?.id);
    if (!spec) continue;
    const model = spec.model;
    const token = res.response?.tokenUsage;
    const tokenIn = token?.prompt ?? 0;
    const tokenOut = token?.completion ?? 0;
    const cost = calcCost(tokenIn, tokenOut, Number(model.cost_input) || null, Number(model.cost_output) || null);

    const snapshot = {
      runId,
      caseId: c.id,
      modelId: model.id,
      provider: res.provider?.id,
      latencyMs: res.latencyMs ?? null,
      tokenUsage: token ?? null,
      error: res.error ?? null,
      output: res.response?.output ?? null,
      finishReason: res.response?.finishReason ?? null,
      grading: res.gradingResult ?? null,
    };
    writeFileSync(path.join(snapDir, `${c.id}_${model.id}.json`), JSON.stringify(snapshot, null, 2));

    await query(
      `INSERT INTO run_outputs
        (run_id, case_id, model_id, raw_output, token_in, token_out, latency_ms, cost_usd, snapshot_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [runId, c.id, model.id, res.response?.output ?? null, tokenIn, tokenOut, res.latencyMs ?? null, cost, JSON.stringify(snapshot)],
    );

    // 判分结果（L1 javascript 或 L2 llm-rubric）
    const comp = res.gradingResult?.componentResults?.[0];
    const score = comp?.score ?? null;
    const reason = comp?.reason ?? res.gradingResult?.reason ?? null;
    await query(
      `INSERT INTO judge_scores (run_id, case_id, model_id, score, rubric_text, reason)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [runId, c.id, model.id, score, c.rubric ?? null, reason ?? null],
    );
  }
}
