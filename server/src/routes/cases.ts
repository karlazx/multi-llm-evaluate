import type { FastifyInstance } from 'fastify';
import { query } from '../db.js';

export async function caseRoutes(app: FastifyInstance) {
  // 列表（可选 status/dimension/type 过滤）
  app.get('/api/cases', async (req) => {
    const { status, dimension, type } = req.query as Record<string, string | undefined>;
    const conds: string[] = [];
    const params: unknown[] = [];
    if (status) { params.push(status); conds.push(`status = $${params.length}`); }
    if (dimension) { params.push(dimension); conds.push(`dimension = $${params.length}`); }
    if (type) { params.push(type); conds.push(`type = $${params.length}`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await query(`SELECT * FROM cases ${where} ORDER BY id`, params);
    return rows;
  });

  app.get('/api/cases/:id', async (req) => {
    const { id } = req.params as { id: string };
    const { rows } = await query('SELECT * FROM cases WHERE id=$1', [id]);
    if (!rows[0]) return app.httpErrors.notFound('用例不存在');
    return rows[0];
  });

  app.post('/api/cases', async (req) => {
    const b = req.body as Record<string, unknown>;
    const { rows } = await query(
      `INSERT INTO cases (title, prompt, dimension, type, expected_answer, rubric, assertion_script, source, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        b.title,
        b.prompt,
        b.dimension ?? null,
        b.type ?? 'subjective',
        b.expected_answer ?? null,
        b.rubric ?? null,
        b.assertion_script ?? null,
        b.source ?? 'self',
        b.tags ?? null,
      ],
    );
    return rows[0];
  });

  app.put('/api/cases/:id', async (req) => {
    const { id } = req.params as { id: string };
    const b = req.body as Record<string, unknown>;
    const { rows } = await query(
      `UPDATE cases SET title=$1, prompt=$2, dimension=$3, type=$4, expected_answer=$5, rubric=$6,
        assertion_script=$7, source=$8, tags=$9, version=version+1 WHERE id=$10 RETURNING *`,
      [
        b.title,
        b.prompt,
        b.dimension ?? null,
        b.type ?? 'subjective',
        b.expected_answer ?? null,
        b.rubric ?? null,
        b.assertion_script ?? null,
        b.source ?? 'self',
        b.tags ?? null,
        id,
      ],
    );
    if (!rows[0]) return app.httpErrors.notFound('用例不存在');
    return rows[0];
  });

  // 批量导入：JSON 数组，每项 { title, prompt, dimension?, type?, expected_answer?, rubric? }
  app.post('/api/cases/import', async (req) => {
    const body = req.body;
    const items = Array.isArray(body) ? body : (body as { cases?: unknown[] })?.cases;
    if (!Array.isArray(items) || items.length === 0) {
      return app.httpErrors.badRequest('需要 JSON 数组（或 { cases: [...] }），至少 1 条');
    }
    let inserted = 0;
    const errors: Array<{ index: number; reason: string }> = [];
    for (let i = 0; i < items.length; i++) {
      const b = items[i] as Record<string, unknown>;
      if (!b || typeof b.title !== 'string' || !b.title.trim()) { errors.push({ index: i, reason: 'title 缺失' }); continue; }
      if (typeof b.prompt !== 'string' || !b.prompt.trim()) { errors.push({ index: i, reason: 'prompt 缺失' }); continue; }
      await query(
        `INSERT INTO cases (title, prompt, dimension, type, expected_answer, rubric, assertion_script, source, tags)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          b.title.trim(),
          b.prompt,
          typeof b.dimension === 'string' ? b.dimension : null,
          typeof b.type === 'string' ? b.type : 'subjective',
          typeof b.expected_answer === 'string' ? b.expected_answer : null,
          typeof b.rubric === 'string' ? b.rubric : null,
          typeof b.assertion_script === 'string' ? b.assertion_script : null,
          typeof b.source === 'string' ? b.source : 'self',
          Array.isArray(b.tags) ? b.tags : null,
        ],
      );
      inserted++;
    }
    return { inserted, failed: errors.length, errors };
  });

  // 停用不删（status → archived）
  app.delete('/api/cases/:id', async (req) => {
    const { id } = req.params as { id: string };
    const { rows } = await query(`UPDATE cases SET status='archived' WHERE id=$1 RETURNING id`, [id]);
    if (!rows[0]) return app.httpErrors.notFound('用例不存在');
    return { ok: true, id: Number(id), status: 'archived' };
  });
}
