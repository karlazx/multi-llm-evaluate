import type { FastifyInstance } from 'fastify';
import { query } from '../db.js';
import { runEval } from '../services/evalRunner.js';
import { aggregateReport, buildReport, reportToHtml, reportToMarkdown } from '../services/report.js';
import { getPairwise, runPairwise } from '../services/pairwise.js';

export async function evalRoutes(app: FastifyInstance) {
  app.get('/api/evals', async () => {
    const { rows } = await query('SELECT * FROM eval_runs ORDER BY id DESC');
    return rows;
  });

  app.get('/api/evals/:id', async (req) => {
    const { id } = req.params as { id: string };
    const { rows } = await query('SELECT * FROM eval_runs WHERE id=$1', [id]);
    if (!rows[0]) return app.httpErrors.notFound('轮次不存在');
    return rows[0];
  });

  // 发起评测：建 run 后后台执行（不阻塞响应），前端轮询状态
  app.post('/api/evals', async (req) => {
    const b = req.body as {
      name?: string; case_ids: number[]; model_ids: number[]; judge_model_id?: number;
      config?: { timeoutSecs?: number; maxOutputTokens?: number; maxCostUsd?: number | null; concurrency?: number };
    };
    if (!Array.isArray(b.case_ids) || !b.case_ids.length) return app.httpErrors.badRequest('case_ids 不能为空');
    if (!Array.isArray(b.model_ids) || !b.model_ids.length) return app.httpErrors.badRequest('model_ids 不能为空');

    const { rows } = await query(
      `INSERT INTO eval_runs (name, case_ids, model_ids, judge_model_id, status, config_json)
       VALUES ($1,$2,$3,$4,'pending',$5) RETURNING *`,
      [
        b.name ?? `run-${Date.now()}`,
        b.case_ids,
        b.model_ids,
        b.judge_model_id ?? null,
        { case_ids: b.case_ids, model_ids: b.model_ids, ...(b.config ?? {}) },
      ],
    );
    const run = rows[0];
    // 后台执行，失败则标记 status=failed
    void runEval(run.id).catch(async (e) => {
      await query("UPDATE eval_runs SET status='failed', fail_reason=$1, finished_at=now() WHERE id=$2", [String((e as Error)?.message ?? e).slice(0, 240), run.id]);
      app.log.error(`run ${run.id} 失败: ${(e as Error).message}`);
    });
    return run;
  });

  // 重跑：复制该轮配置（用例×模型×裁判）发起新轮次，历史保留
  app.post('/api/evals/:id/rerun', async (req) => {
    const { id } = req.params as { id: string };
    const orig = (await query('SELECT * FROM eval_runs WHERE id=$1', [id])).rows[0];
    if (!orig) return app.httpErrors.notFound('轮次不存在');
    if (!orig.case_ids?.length || !orig.model_ids?.length) return app.httpErrors.badRequest('原轮次缺少用例或模型配置');
    const { rows } = await query(
      `INSERT INTO eval_runs (name, case_ids, model_ids, judge_model_id, status, config_json)
       VALUES ($1,$2,$3,$4,'pending',$5) RETURNING *`,
      [
        `${orig.name}·重跑`,
        orig.case_ids,
        orig.model_ids,
        orig.judge_model_id,
        { ...(typeof orig.config_json === 'string' ? JSON.parse(orig.config_json || '{}') : orig.config_json ?? {}), rerun_of: Number(id) },
      ],
    );
    const run = rows[0];
    void runEval(run.id).catch(async (e) => {
      await query("UPDATE eval_runs SET status='failed', fail_reason=$1, finished_at=now() WHERE id=$2", [String((e as Error)?.message ?? e).slice(0, 240), run.id]);
      app.log.error(`rerun ${run.id} 失败: ${(e as Error).message}`);
    });
    return run;
  });

  app.get('/api/evals/:id/outputs', async (req) => {
    const { id } = req.params as { id: string };
    const { rows } = await query(
      `SELECT o.*, c.title AS case_title, m.name AS model_name, m.display_name AS model_display
       FROM run_outputs o
       JOIN cases c ON c.id = o.case_id
       JOIN models m ON m.id = o.model_id
       WHERE o.run_id=$1 ORDER BY o.case_id, o.model_id`,
      [id],
    );
    return rows;
  });

  // 报告：总分排行 + 分维度 + 成本看板 + 单用例穿透（按轮次归档）
  app.get('/api/evals/:id/report', async (req) => {
    const { id } = req.params as { id: string };
    return buildReport(Number(id));
  });

  // 报告导出：?format=md（默认，Markdown）| pdf（打印友好 HTML，浏览器打印为 PDF）
  app.get('/api/evals/:id/export', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { format } = req.query as { format?: string };
    const report = await buildReport(Number(id));
    if (format === 'pdf') {
      reply.type('text/html; charset=utf-8');
      return reportToHtml(report);
    }
    reply.type('text/markdown; charset=utf-8');
    return reportToMarkdown(report);
  });

  // pairwise 对评（AI 裁判 + 位置交换消偏）：按需触发
  app.post('/api/evals/:id/pairwise', async (req) => {
    const { id } = req.params as { id: string };
    try {
      return await runPairwise(Number(id));
    } catch (e) {
      return app.httpErrors.badRequest((e as Error).message);
    }
  });

  app.get('/api/evals/:id/pairwise', async (req) => {
    const { id } = req.params as { id: string };
    return getPairwise(Number(id));
  });

  // 跨轮次对比（增量评测：新模型跑完并入历史轮次一起看）
  app.get('/api/evals/compare', async (req) => {
    const { run_ids } = req.query as { run_ids?: string };
    const ids = (run_ids ?? '').split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
    if (!ids.length) return app.httpErrors.badRequest('run_ids 必填（逗号分隔）');
    return aggregateReport(ids);
  });
}
