import { query } from '../db.js';

export interface Report {
  run_id: number;
  generated_at: string;
  ranking: Array<{ model_id: number; model_name: string; avg_score: number | null }>;
  dimensions: Array<{ dimension: string; model_id: number; model_name: string; avg_score: number | null }>;
  costs: Array<{
    model_id: number;
    model_name: string;
    total_cost_usd: number | null;
    total_tokens: number | null;
    avg_latency_ms: number | null;
  }>;
  details: Array<{
    case_id: number;
    case_title: string;
    dimension: string | null;
    model_id: number;
    model_name: string;
    score: number | null;
    reason: string | null;
    raw_output: string | null;
    latency_ms: number | null;
  }>;
}

/** 归一化到 0-100：L1 与 L2 的 score 均为 0-1（llm-rubric 默认返回 0-1），统一 ×100 */
const NORM = `s.score * 100`;

/** 汇总一轮评测为报告，并存 reports 表归档（按 run_id，不覆盖历史轮次） */
export async function buildReport(runId: number): Promise<Report> {
  const ranking = (
    await query(
      `SELECT m.id AS model_id, COALESCE(m.display_name, m.name) AS model_name,
              ROUND(AVG(${NORM})::numeric, 1) AS avg_score
       FROM judge_scores s JOIN cases c ON c.id=s.case_id JOIN models m ON m.id=s.model_id
       WHERE s.run_id=$1 GROUP BY m.id, m.name, m.display_name ORDER BY avg_score DESC`,
      [runId],
    )
  ).rows;

  const dimensions = (
    await query(
      `SELECT c.dimension, m.id AS model_id, COALESCE(m.display_name, m.name) AS model_name,
              ROUND(AVG(${NORM})::numeric, 1) AS avg_score
       FROM judge_scores s JOIN cases c ON c.id=s.case_id JOIN models m ON m.id=s.model_id
       WHERE s.run_id=$1 AND c.dimension IS NOT NULL
       GROUP BY c.dimension, m.id, m.name, m.display_name ORDER BY c.dimension, avg_score DESC`,
      [runId],
    )
  ).rows;

  const costs = (
    await query(
      `SELECT m.id AS model_id, COALESCE(m.display_name, m.name) AS model_name,
              ROUND(SUM(o.cost_usd)::numeric, 6) AS total_cost_usd,
              SUM(o.token_in + o.token_out) AS total_tokens,
              ROUND(AVG(o.latency_ms)::numeric, 0) AS avg_latency_ms
       FROM run_outputs o JOIN models m ON m.id=o.model_id
       WHERE o.run_id=$1 GROUP BY m.id, m.name, m.display_name ORDER BY total_cost_usd DESC NULLS LAST`,
      [runId],
    )
  ).rows;

  const details = (
    await query(
      `SELECT s.case_id, c.title AS case_title, c.dimension, s.model_id,
              COALESCE(m.display_name, m.name) AS model_name,
              s.score, s.reason, o.raw_output, o.latency_ms
       FROM judge_scores s
       JOIN cases c ON c.id=s.case_id
       JOIN models m ON m.id=s.model_id
       LEFT JOIN run_outputs o ON o.run_id=s.run_id AND o.case_id=s.case_id AND o.model_id=s.model_id
       WHERE s.run_id=$1 ORDER BY s.case_id, s.model_id`,
      [runId],
    )
  ).rows;

  const report: Report = {
    run_id: runId,
    generated_at: new Date().toISOString(),
    ranking: ranking as Report['ranking'],
    dimensions: dimensions as Report['dimensions'],
    costs: costs as Report['costs'],
    details: details as Report['details'],
  };

  // 归档：同一 run 覆盖更新（不同 run 互不影响，天然按轮次归档）
  await query(
    `INSERT INTO reports (run_id, ranking_json, dimension_json, generated_at)
     VALUES ($1,$2,$3,now())
     ON CONFLICT (run_id) DO UPDATE SET ranking_json=$2, dimension_json=$3, generated_at=now()`,
    [runId, JSON.stringify(ranking), JSON.stringify(dimensions)],
  );

  return report;
}
