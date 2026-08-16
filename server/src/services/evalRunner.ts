import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { evaluate } from 'promptfoo';
import { config } from '../config.js';
import { query } from '../db.js';
import { buildProvider, calcCost, type ModelRow } from './providers.js';

interface CaseRow {
  id: number;
  title: string;
  prompt: string;
  type: string;
  dimension: string | null;
}

/**
 * 跑一轮评测：caseIds × modelIds。
 * - 每个模型一个 evaluate() 调用（模型间失败隔离），用例在单次 evaluate 内并发。
 * - 单用例失败由 promptfoo 逐 result 记录 error，不影响其它用例。
 * - 原始产出全量落盘 data/snapshots/<runId>/<caseId>_<modelId>.json + 关键指标写 run_outputs。
 */
export async function runEval(runId: number): Promise<void> {
  const run = (await query('SELECT * FROM eval_runs WHERE id=$1', [runId])).rows[0];
  if (!run) throw new Error(`run ${runId} 不存在`);
  const caseIds: number[] = run.case_ids ?? [];
  const modelIds: number[] = run.model_ids ?? [];

  const cases = (
    await query('SELECT * FROM cases WHERE id = ANY($1::bigint[]) ORDER BY id', [caseIds])
  ).rows as CaseRow[];
  const models = (
    await query('SELECT * FROM models WHERE id = ANY($1::bigint[]) ORDER BY id', [modelIds])
  ).rows as ModelRow[];

  await query("UPDATE eval_runs SET status='running', started_at=now() WHERE id=$1", [runId]);

  const snapDir = path.join(config.snapshotDir, String(runId));
  mkdirSync(snapDir, { recursive: true });

  const modelConcurrency = 2; // 同时跑几个模型
  for (let i = 0; i < models.length; i += modelConcurrency) {
    const batch = models.slice(i, i + modelConcurrency);
    await Promise.all(
      batch.map((model) =>
        runOneModel(runId, model, cases, snapDir).catch(async (e) => {
          // 模型级失败隔离：为该模型的每个用例记一条错误输出
          for (const c of cases) {
            await query(
              `INSERT INTO run_outputs (run_id, case_id, model_id, raw_output, snapshot_json)
               VALUES ($1,$2,$3,$4,$5)`,
              [runId, c.id, model.id, null, JSON.stringify({ error: (e as Error).message })],
            );
          }
        }),
      ),
    );
  }

  await query("UPDATE eval_runs SET status='done', finished_at=now() WHERE id=$1", [runId]);
}

async function runOneModel(
  runId: number,
  model: ModelRow,
  cases: CaseRow[],
  snapDir: string,
): Promise<void> {
  const provider = buildProvider(model);
  const r = await evaluate({
    providers: [provider],
    prompts: cases.map((c) => ({ label: `case:${c.id}`, raw: c.prompt })),
  });

  for (const res of r.results as any[]) {
    const label = String(res.prompt?.label ?? '');
    const caseId = Number(label.replace(/^case:/, ''));
    if (!Number.isFinite(caseId)) continue;

    const token = res.response?.tokenUsage;
    const tokenIn = token?.prompt ?? 0;
    const tokenOut = token?.completion ?? 0;
    const cost = calcCost(tokenIn, tokenOut, Number(model.cost_input) || null, Number(model.cost_output) || null);

    const snapshot = {
      runId,
      caseId,
      modelId: model.id,
      provider: res.provider?.id,
      latencyMs: res.latencyMs ?? null,
      tokenUsage: token ?? null,
      error: res.error ?? null,
      output: res.response?.output ?? null,
      finishReason: res.response?.finishReason ?? null,
    };
    writeFileSync(path.join(snapDir, `${caseId}_${model.id}.json`), JSON.stringify(snapshot, null, 2));

    await query(
      `INSERT INTO run_outputs
        (run_id, case_id, model_id, raw_output, token_in, token_out, latency_ms, cost_usd, snapshot_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        runId,
        caseId,
        model.id,
        res.response?.output ?? null,
        tokenIn,
        tokenOut,
        res.latencyMs ?? null,
        cost,
        JSON.stringify(snapshot),
      ],
    );
  }
}
