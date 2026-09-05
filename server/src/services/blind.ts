import { query } from '../db.js';

interface Vote { winner: number; loser: number }

/** 从投票序列计算 ELO 排名（初始 1500，K=32） */
export function computeElo(votes: Vote[]): Map<number, number> {
  const ratings = new Map<number, number>();
  for (const v of votes) {
    const rA = ratings.get(v.winner) ?? 1500;
    const rB = ratings.get(v.loser) ?? 1500;
    const eA = 1 / (1 + Math.pow(10, (rB - rA) / 400));
    const K = 32;
    ratings.set(v.winner, rA + K * (1 - eA));
    ratings.set(v.loser, rB + K * (0 - (1 - eA)));
  }
  return ratings;
}

/** 单用例的模型输出对（盲评候选），带匿名序号 */
export async function caseOutputs(runId: number) {
  const { rows } = await query(
    `SELECT o.case_id, o.model_id, o.raw_output, c.title AS case_title, c.type AS case_type
     FROM run_outputs o JOIN cases c ON c.id=o.case_id
     WHERE o.run_id=$1 ORDER BY o.case_id, o.model_id`,
    [runId],
  );
  return rows;
}

/** ELO 排名（弃权票"都不合格"不计入 ELO） */
export async function eloRanking(runId: number) {
  const votes = (
    await query(
      `SELECT winner_model_id AS winner, loser_model_id AS loser FROM blind_votes
       WHERE run_id=$1 AND winner_model_id IS NOT NULL AND loser_model_id IS NOT NULL`,
      [runId],
    )
  ).rows as Vote[];
  const ratings = computeElo(votes);
  // 仅统计本 run 内的模型（有产出）
  const models = (
    await query(
      `SELECT DISTINCT m.id, COALESCE(m.display_name, m.name) AS name
       FROM models m JOIN run_outputs o ON o.model_id = m.id
       WHERE o.run_id=$1 ORDER BY m.id`,
      [runId],
    )
  ).rows as Array<{ id: number; name: string }>;

  const voteCount = new Map<number, number>();
  for (const v of votes) {
    voteCount.set(v.winner, (voteCount.get(v.winner) ?? 0) + 1);
    voteCount.set(v.loser, (voteCount.get(v.loser) ?? 0) + 1);
  }

  return models
    .map((m) => ({ model_id: m.id, model_name: m.name, elo: ratings.get(m.id) ?? 1500, votes: voteCount.get(m.id) ?? 0 }))
    .sort((a, b) => b.elo - a.elo);
}

/** 校准面板：AI 分 vs 人工投票一致性（弃权票单独统计，不参与一致性） */
export async function calibration(runId: number) {
  const abstain = (
    await query(
      `SELECT COUNT(*)::int AS n FROM blind_votes WHERE run_id=$1 AND winner_model_id IS NULL`,
      [runId],
    )
  ).rows[0]?.n ?? 0;

  const votes = (
    await query(
      `SELECT v.case_id, v.winner_model_id AS winner, v.loser_model_id AS loser,
              ws.score AS w_score, ls.score AS l_score
       FROM blind_votes v
       LEFT JOIN judge_scores ws ON ws.run_id=v.run_id AND ws.case_id=v.case_id AND ws.model_id=v.winner_model_id
       LEFT JOIN judge_scores ls ON ls.run_id=v.run_id AND ls.case_id=v.case_id AND ls.model_id=v.loser_model_id
       WHERE v.run_id=$1 AND v.winner_model_id IS NOT NULL`,
      [runId],
    )
  ).rows as Array<{ winner: number; loser: number; w_score: number | null; l_score: number | null }>;

  let agree = 0;
  let comparable = 0;
  for (const v of votes) {
    if (v.w_score == null || v.l_score == null) continue;
    comparable++;
    if (v.w_score >= v.l_score) agree++;
  }
  const agreement = comparable ? Number((agree / comparable).toFixed(3)) : null;

  // 每个模型的 AI 平均分（0-100 归一）
  const aiAvg = (
    await query(
      `SELECT m.id, COALESCE(m.display_name, m.name) AS name, ROUND(AVG(s.score*100)::numeric,1) AS ai_score
       FROM judge_scores s JOIN models m ON m.id=s.model_id WHERE s.run_id=$1
       GROUP BY m.id, m.name, m.display_name ORDER BY ai_score DESC`,
      [runId],
    )
  ).rows;

  const elo = await eloRanking(runId);
  return { agreement, comparable, total_votes: votes.length, abstain, ai_avg: aiAvg, elo };
}
