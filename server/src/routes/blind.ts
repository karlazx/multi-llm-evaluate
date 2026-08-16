import type { FastifyInstance } from 'fastify';
import { query } from '../db.js';
import { caseOutputs, eloRanking, calibration } from '../services/blind.js';

export async function blindRoutes(app: FastifyInstance) {
  // 盲评数据：run 内各用例的模型输出（含匿名对比所需的原始产出）
  app.get('/api/blind/:runId/outputs', async (req) => {
    const { runId } = req.params as { runId: string };
    const outputs = await caseOutputs(Number(runId));
    const models = (
      await query('SELECT id, COALESCE(display_name, name) AS name FROM models WHERE status=$1 ORDER BY id', ['active'])
    ).rows;
    return { outputs, models };
  });

  // 投票回写
  app.post('/api/blind/votes', async (req) => {
    const b = req.body as { run_id: number; case_id: number; winner_model_id: number; loser_model_id: number; voter?: string };
    if (!b.run_id || !b.case_id || !b.winner_model_id || !b.loser_model_id) {
      return app.httpErrors.badRequest('run_id/case_id/winner_model_id/loser_model_id 必填');
    }
    if (b.winner_model_id === b.loser_model_id) return app.httpErrors.badRequest('不能投给自己');
    const { rows } = await query(
      `INSERT INTO blind_votes (run_id, case_id, winner_model_id, loser_model_id, voter)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [b.run_id, b.case_id, b.winner_model_id, b.loser_model_id, b.voter ?? 'anonymous'],
    );
    return rows[0];
  });

  // ELO 排名
  app.get('/api/blind/:runId/elo', async (req) => {
    const { runId } = req.params as { runId: string };
    return eloRanking(Number(runId));
  });

  // AI 分 vs 人工分一致性
  app.get('/api/blind/:runId/calibration', async (req) => {
    const { runId } = req.params as { runId: string };
    return calibration(Number(runId));
  });
}
