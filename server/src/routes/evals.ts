import type { FastifyInstance } from 'fastify';
import { query } from '../db.js';
import { runEval } from '../services/evalRunner.js';

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
    const b = req.body as { name?: string; case_ids: number[]; model_ids: number[]; judge_model_id?: number };
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
        { case_ids: b.case_ids, model_ids: b.model_ids },
      ],
    );
    const run = rows[0];
    // 后台执行，失败则标记 status=failed
    void runEval(run.id).catch(async (e) => {
      await query("UPDATE eval_runs SET status='failed' WHERE id=$1", [run.id]);
      app.log.error(`run ${run.id} 失败: ${(e as Error).message}`);
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
}
