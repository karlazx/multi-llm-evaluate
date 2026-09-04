import { query } from '../db.js';

export interface Report {
  run_id: number;
  run_ids: number[];
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

/** 归一化到 0-100：L1 与 L2 的 score 均为 0-1，统一 ×100 */
const NORM = `s.score * 100`;
const RUNS = `s.run_id = ANY($1::bigint[])`;

/** 跨一轮或多轮聚合报告（增量评测对比用多轮） */
export async function aggregateReport(runIds: number[]): Promise<Report> {
  const ranking = (
    await query(
      `SELECT m.id AS model_id, COALESCE(m.display_name, m.name) AS model_name,
              ROUND(AVG(${NORM})::numeric, 1) AS avg_score
       FROM judge_scores s JOIN cases c ON c.id=s.case_id JOIN models m ON m.id=s.model_id
       WHERE ${RUNS} GROUP BY m.id, m.name, m.display_name ORDER BY avg_score DESC`,
      [runIds],
    )
  ).rows;

  const dimensions = (
    await query(
      `SELECT c.dimension, m.id AS model_id, COALESCE(m.display_name, m.name) AS model_name,
              ROUND(AVG(${NORM})::numeric, 1) AS avg_score
       FROM judge_scores s JOIN cases c ON c.id=s.case_id JOIN models m ON m.id=s.model_id
       WHERE ${RUNS} AND c.dimension IS NOT NULL
       GROUP BY c.dimension, m.id, m.name, m.display_name ORDER BY c.dimension, avg_score DESC`,
      [runIds],
    )
  ).rows;

  const costs = (
    await query(
      `SELECT m.id AS model_id, COALESCE(m.display_name, m.name) AS model_name,
              ROUND(SUM(o.cost_usd)::numeric, 6) AS total_cost_usd,
              SUM(o.token_in + o.token_out) AS total_tokens,
              ROUND(AVG(o.latency_ms)::numeric, 0) AS avg_latency_ms
       FROM run_outputs o JOIN models m ON m.id=o.model_id
       WHERE o.run_id = ANY($1::bigint[])
       GROUP BY m.id, m.name, m.display_name ORDER BY total_cost_usd DESC NULLS LAST`,
      [runIds],
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
       WHERE ${RUNS} ORDER BY s.case_id, s.model_id`,
      [runIds],
    )
  ).rows;

  return {
    run_id: runIds[runIds.length - 1],
    run_ids: runIds,
    generated_at: new Date().toISOString(),
    ranking: ranking as Report['ranking'],
    dimensions: dimensions as Report['dimensions'],
    costs: costs as Report['costs'],
    details: details as Report['details'],
  };
}

/** 单轮报告（归档到 reports 表，按 run_id 不覆盖历史） */
export async function buildReport(runId: number): Promise<Report> {
  const report = await aggregateReport([runId]);
  await query(
    `INSERT INTO reports (run_id, ranking_json, dimension_json, generated_at)
     VALUES ($1,$2,$3,now())
     ON CONFLICT (run_id) DO UPDATE SET ranking_json=$2, dimension_json=$3, generated_at=now()`,
    [runId, JSON.stringify(report.ranking), JSON.stringify(report.dimensions)],
  );
  return report;
}

/** 报告 → Markdown 文本（供导出） */
export function reportToMarkdown(r: Report): string {
  const dims = Array.from(new Set(r.dimensions.map((d) => d.dimension)));
  const models = Array.from(new Set(r.ranking.map((x) => x.model_name)));
  const L: string[] = [];
  L.push(`# 评测报告（轮次 ${r.run_ids.join(', ')}）`);
  L.push(`\n生成时间：${r.generated_at}\n`);

  L.push('## ① 总分排行');
  L.push('| 名次 | 模型 | 平均分(0-100) |');
  L.push('| --- | --- | --- |');
  r.ranking.forEach((x, i) => L.push(`| ${i + 1} | ${x.model_name} | ${x.avg_score ?? '-'} |`));

  L.push('\n## ② 分维度得分');
  L.push(`| 维度 | ${models.join(' | ')} |`);
  L.push(`| --- | ${models.map(() => ' --- ').join('|')} |`);
  for (const d of dims) {
    const cells = models.map((n) => r.dimensions.find((x) => x.dimension === d && x.model_name === n)?.avg_score ?? '-');
    L.push(`| ${d} | ${cells.join(' | ')} |`);
  }

  L.push('\n## ③ 成本 / token / 耗时');
  L.push('| 模型 | 总成本(USD) | 总 token | 平均延迟 |');
  L.push('| --- | --- | --- | --- |');
  for (const c of r.costs) {
    L.push(`| ${c.model_name} | ${c.total_cost_usd != null ? '$' + Number(c.total_cost_usd).toFixed(6) : '-'} | ${c.total_tokens ?? '-'} | ${c.avg_latency_ms != null ? c.avg_latency_ms + 'ms' : '-'} |`);
  }

  L.push('\n## ④ 单用例穿透');
  L.push('| 用例 | 维度 | 模型 | 得分 | 理由 |');
  L.push('| --- | --- | --- | --- | --- |');
  for (const d of r.details) {
    L.push(`| ${d.case_title} | ${d.dimension ?? '-'} | ${d.model_name} | ${d.score ?? '-'} | ${(d.reason ?? '').replace(/\|/g, '\\|').slice(0, 120)} |`);
  }

  return L.join('\n');
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 报告 → 打印友好 HTML（浏览器"打印为 PDF"，A4 排版） */
export function reportToHtml(r: Report): string {
  const dims = Array.from(new Set(r.dimensions.map((d) => d.dimension)));
  const models = Array.from(new Set(r.ranking.map((x) => x.model_name)));
  const rankRows = r.ranking
    .map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.model_name)}</td><td class="num">${esc(x.avg_score ?? '-')}</td></tr>`)
    .join('');
  const dimHeader = models.map((m) => `<th>${esc(m)}</th>`).join('');
  const dimRows = dims
    .map((d) => {
      const cells = models
        .map((m) => `<td class="num">${esc(r.dimensions.find((x) => x.dimension === d && x.model_name === m)?.avg_score ?? '-')}</td>`)
        .join('');
      return `<tr><td>${esc(d)}</td>${cells}</tr>`;
    })
    .join('');
  const costRows = r.costs
    .map((c) => `<tr><td>${esc(c.model_name)}</td><td class="num">${c.total_cost_usd != null ? '$' + Number(c.total_cost_usd).toFixed(6) : '-'}</td><td class="num">${esc(c.total_tokens ?? '-')}</td><td class="num">${c.avg_latency_ms != null ? c.avg_latency_ms + 'ms' : '-'}</td></tr>`)
    .join('');
  const detailRows = r.details
    .map((d) => `<tr><td>${esc(d.case_title)}</td><td>${esc(d.dimension ?? '-')}</td><td>${esc(d.model_name)}</td><td class="num">${d.score != null ? Number(d.score).toFixed(1) : '-'}</td><td>${esc((d.reason ?? '').slice(0, 140))}</td></tr>`)
    .join('');

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>评测报告（轮次 ${r.run_ids.join(', ')}）</title>
<style>
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; color: #16181d; margin: 32px; font-size: 13px; }
  h1 { font-size: 20px; } h2 { font-size: 15px; margin-top: 26px; }
  .meta { color: #8b93a5; font-size: 12px; margin-bottom: 18px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; page-break-inside: auto; }
  th, td { border: 1px solid #d9dee8; padding: 6px 10px; text-align: left; }
  th { background: #f2f4f8; font-size: 12px; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr { page-break-inside: avoid; }
  @media print { body { margin: 12mm; } }
</style></head><body>
<h1>评测报告</h1>
<div class="meta">轮次 ${r.run_ids.map((x) => '#' + x).join('、')} ｜ 生成时间：${esc(r.generated_at)}</div>
<h2>① 总分排行</h2>
<table><thead><tr><th>名次</th><th>模型</th><th>平均分（0-100）</th></tr></thead><tbody>${rankRows}</tbody></table>
<h2>② 分维度得分</h2>
<table><thead><tr><th>维度</th>${dimHeader}</tr></thead><tbody>${dimRows}</tbody></table>
<h2>③ 成本 / token / 耗时</h2>
<table><thead><tr><th>模型</th><th>总成本（USD）</th><th>总 token</th><th>平均延迟</th></tr></thead><tbody>${costRows}</tbody></table>
<h2>④ 单用例穿透</h2>
<table><thead><tr><th>用例</th><th>维度</th><th>模型</th><th>得分</th><th>判分理由</th></tr></thead><tbody>${detailRows}</tbody></table>
<script>window.onload = () => { /* 便于直接 Ctrl/Cmd+P 打印为 PDF */ };</script>
</body></html>`;
}
