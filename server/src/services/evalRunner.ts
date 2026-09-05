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

/** 轮次高级设置（存于 eval_runs.config_json，全部可缺省） */
export interface RunConfig {
  timeoutSecs?: number;      // 单用例超时，默认 120
  maxOutputTokens?: number;  // 覆盖最大输出 token；缺省时按类型 code=16384 其余=4096
  maxCostUsd?: number | null; // 费用熔断阈值；缺省/空 = 不熔断
  concurrency?: number;      // 用例并发数，默认 2
}

function readRunConfig(raw: unknown): RunConfig {
  const c = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw ?? {});
  return {
    timeoutSecs: Number(c.timeoutSecs) > 0 ? Number(c.timeoutSecs) : 120,
    maxOutputTokens: Number(c.maxOutputTokens) > 0 ? Number(c.maxOutputTokens) : undefined,
    maxCostUsd: c.maxCostUsd != null && Number(c.maxCostUsd) > 0 ? Number(c.maxCostUsd) : null,
    concurrency: Number(c.concurrency) >= 1 ? Math.min(Number(c.concurrency), 4) : 2,
  };
}

function maxTokensFor(type: string, override?: number): number {
  if (override) return override;
  return type === 'code' ? 16384 : 4096;
}

/** 无输出原因判定 */
function noOutputReason(output: string | null | undefined, finishReason: string | null | undefined, error: string | null | undefined): string | null {
  if (output && output.trim() !== '') return null;
  if (error) return `调用失败：${String(error).slice(0, 200)}`;
  if (finishReason === 'length') return '无输出：模型把输出预算全部耗在思考上（finishReason=length，可加大 max_tokens 或关闭思考）';
  return '模型返回空内容';
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

/** 跑一轮评测：每个用例一次 evaluate（所有模型一起跑），支持超时/费用熔断/并发配置 */
export async function runEval(runId: number): Promise<void> {
  const run = (await query('SELECT * FROM eval_runs WHERE id=$1', [runId])).rows[0];
  if (!run) throw new Error(`run ${runId} 不存在`);
  const cfg = readRunConfig(run.config_json);
  const caseIds: number[] = run.case_ids ?? [];
  const modelIds: number[] = run.model_ids ?? [];

  const cases = (await query('SELECT * FROM cases WHERE id = ANY($1::bigint[]) ORDER BY id', [caseIds])).rows as CaseRow[];
  const models = (await query('SELECT * FROM models WHERE id = ANY($1::bigint[]) ORDER BY id', [modelIds])).rows as ModelRow[];
  const judgeModel = await resolveJudgeModel(run);

  const needJudge = cases.some((c) => !l1JudgeByName(c.assertion_script) && c.rubric);
  if (needJudge && !judgeModel) {
    await query("UPDATE eval_runs SET status='failed', fail_reason='缺少裁判模型', finished_at=now() WHERE id=$1", [runId]);
    throw new Error('存在主观/代码题但没有可用的裁判模型（is_judge=true 或指定 judge_model_id）');
  }
  const judgeProvider = judgeModel ? buildProvider(judgeModel, { maxTokens: 1024 }) : null;

  await query("UPDATE eval_runs SET status='running', started_at=now() WHERE id=$1", [runId]);
  const snapDir = path.join(config.snapshotDir, String(runId));
  mkdirSync(snapDir, { recursive: true });

  let spent = 0; // 累计费用
  let stoppedByCost = false;
  const remaining = [...cases];
  let cursor = 0;

  async function worker() {
    while (cursor < remaining.length) {
      if (stoppedByCost) return;
      const c = remaining[cursor++];
      // 单用例整体超时；超时后迟到的结果只落快照不再写库（timedOut 旗标防重复行）
      const state = { timedOut: false };
      const timeout = new Promise<'timeout'>((res) => setTimeout(() => { state.timedOut = true; res('timeout'); }, cfg.timeoutSecs! * 1000));
      const job = runOneCase(runId, c, models, judgeProvider, snapDir, cfg, state).then((cost) => ({ kind: 'ok' as const, cost }));
      const outcome = await Promise.race([job, timeout]).catch(async (e) => {
        for (const m of models) {
          await query(
            `INSERT INTO run_outputs (run_id, case_id, model_id, raw_output, no_output_reason, snapshot_json)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [runId, c.id, m.id, null, `跑测异常：${(e as Error).message}`.slice(0, 240), JSON.stringify({ error: String((e as Error)?.message ?? e) })],
          );
        }
        return { kind: 'ok' as const, cost: 0 };
      });
      if (outcome === 'timeout') {
        job.catch(() => { /* 迟到的结果因 timedOut 旗标不再写库 */ });
        for (const m of models) {
          await query(
            `INSERT INTO run_outputs (run_id, case_id, model_id, raw_output, no_output_reason, snapshot_json)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [runId, c.id, m.id, null, `无输出：单用例超时（${cfg.timeoutSecs}s），已跳过`, JSON.stringify({ timeoutSecs: cfg.timeoutSecs })],
          );
        }
      } else {
        spent += outcome.cost;
        if (cfg.maxCostUsd != null && spent > cfg.maxCostUsd) {
          stoppedByCost = true;
          await query("UPDATE eval_runs SET fail_reason=$1 WHERE id=$2", [`费用熔断：已花费 $${spent.toFixed(6)} 超过阈值 $${cfg.maxCostUsd}`, runId]);
        }
      }
    }
  }

  const workers = Array.from({ length: cfg.concurrency! }, () => worker());
  await Promise.allSettled(workers);

  if (stoppedByCost) {
    await query("UPDATE eval_runs SET status='stopped', finished_at=now() WHERE id=$1", [runId]);
  } else {
    await query("UPDATE eval_runs SET status='done', finished_at=now() WHERE id=$1", [runId]);
  }
}

/** 执行单个用例（×所有模型），返回该用例累计费用 */
async function runOneCase(
  runId: number,
  c: CaseRow,
  models: ModelRow[],
  judgeProvider: { id: string; config: Record<string, unknown> } | null,
  snapDir: string,
  cfg: RunConfig,
  state: { timedOut: boolean },
): Promise<number> {
  const maxTokens = maxTokensFor(c.type, cfg.maxOutputTokens);
  const providerSpecs = models.map((m) => ({ model: m, spec: buildProvider(m, { maxTokens }) }));
  const assertions = buildAssertions(c, judgeProvider);
  const startedAt = Date.now();

  const r = await evaluate({
    providers: providerSpecs.map((p) => p.spec),
    prompts: [{ label: `case:${c.id}`, raw: c.prompt }],
    defaultTest: { assert: assertions },
  });

  let caseCost = 0;
  for (const res of r.results as any[]) {
    const spec = providerSpecs.find((p) => p.spec.id === res.provider?.id);
    if (!spec) continue;
    if (state.timedOut) continue; // 超时已记为跳过，迟到的结果不再写库
    const model = spec.model;
    const token = res.response?.tokenUsage;
    const tokenIn = token?.prompt ?? 0;
    const tokenOut = token?.completion ?? 0;
    const cost = calcCost(tokenIn, tokenOut, Number(model.cost_input) || null, Number(model.cost_output) || null);
    caseCost += cost ?? 0;
    const finishedAt = Date.now();
    const output = res.response?.output ?? null;
    const reason = noOutputReason(output, res.response?.finishReason, res.error);

    // 全量快照（含原始结果对象），排查用
    const snapshot = {
      runId,
      caseId: c.id,
      caseTitle: c.title,
      modelId: model.id,
      model: model.name,
      protocol: model.protocol,
      thinking: model.thinking,
      maxTokens,
      provider: res.provider?.id,
      requestStartedAt: new Date(finishedAt - (res.latencyMs ?? 0)).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      caseStartedAt: new Date(startedAt).toISOString(),
      latencyMs: res.latencyMs ?? null,
      tokenUsage: token ?? null,
      error: res.error ?? null,
      output,
      finishReason: res.response?.finishReason ?? null,
      noOutputReason: reason,
      grading: res.gradingResult ?? null,
      raw: { metadata: res.response?.metadata ?? null },
    };
    writeFileSync(path.join(snapDir, `${c.id}_${model.id}.json`), JSON.stringify(snapshot, null, 2));

    await query(
      `INSERT INTO run_outputs
        (run_id, case_id, model_id, raw_output, no_output_reason, token_in, token_out, latency_ms, cost_usd, snapshot_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [runId, c.id, model.id, output, reason, tokenIn, tokenOut, res.latencyMs ?? null, cost, JSON.stringify(snapshot)],
    );

    const comp = res.gradingResult?.componentResults?.[0];
    const score = comp?.score ?? null;
    const gradeReason = comp?.reason ?? res.gradingResult?.reason ?? null;
    await query(
      `INSERT INTO judge_scores (run_id, case_id, model_id, score, rubric_text, reason)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [runId, c.id, model.id, score, c.rubric ?? null, gradeReason ?? null],
    );
  }
  return caseCost;
}
