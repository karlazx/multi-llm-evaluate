import type { FastifyInstance } from 'fastify';
import { evaluate } from 'promptfoo';
import { query } from '../db.js';
import { encrypt, decrypt, maskKey } from '../crypto.js';
import { buildProvider } from '../services/providers.js';

function publicModel(row: Record<string, unknown>) {
  let masked = '';
  if (row.api_key_enc) {
    try {
      masked = maskKey(decrypt(row.api_key_enc as string));
    } catch {
      masked = '(无法解密，请重新录入 Key)';
    }
  }
  return {
    ...row,
    api_key_enc: undefined,
    api_key_masked: masked,
  };
}

export async function modelRoutes(app: FastifyInstance) {
  app.get('/api/models', async (req) => {
    const { status } = req.query as { status?: string };
    const { rows } = status
      ? await query('SELECT * FROM models WHERE status=$1 ORDER BY id DESC', [status])
      : await query('SELECT * FROM models ORDER BY id DESC');
    return rows.map(publicModel);
  });

  app.get('/api/models/:id', async (req) => {
    const { id } = req.params as { id: string };
    const { rows } = await query('SELECT * FROM models WHERE id=$1', [id]);
    if (!rows[0]) return app.httpErrors.notFound('模型不存在');
    return publicModel(rows[0]);
  });

  app.post('/api/models', async (req) => {
    const b = req.body as Record<string, unknown>;
    const enc = b.api_key ? encrypt(String(b.api_key)) : null;
    const { rows } = await query(
      `INSERT INTO models (name, display_name, provider, protocol, endpoint, api_key_enc,
        cost_input, cost_output, thinking, default_params, is_judge)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        b.name,
        b.display_name ?? b.name,
        b.provider ?? null,
        b.protocol ?? 'openai-v1',
        b.endpoint ?? null,
        enc,
        b.cost_input ?? null,
        b.cost_output ?? null,
        b.thinking ?? 'disabled',
        b.default_params ?? {},
        b.is_judge ?? false,
      ],
    );
    return publicModel(rows[0]);
  });

  app.put('/api/models/:id', async (req) => {
    const { id } = req.params as { id: string };
    const b = req.body as Record<string, unknown>;
    // 未提供新 key 则保留原加密 key
    const enc = b.api_key ? encrypt(String(b.api_key)) : undefined;
    const { rows } = await query(
      `UPDATE models SET name=$1, display_name=$2, provider=$3, protocol=$4, endpoint=$5,
        api_key_enc=COALESCE($6, api_key_enc), cost_input=$7, cost_output=$8, thinking=$9,
        default_params=$10, is_judge=$11 WHERE id=$12 RETURNING *`,
      [
        b.name,
        b.display_name ?? b.name,
        b.provider ?? null,
        b.protocol ?? 'openai-v1',
        b.endpoint ?? null,
        enc ?? null,
        b.cost_input ?? null,
        b.cost_output ?? null,
        b.thinking ?? 'disabled',
        b.default_params ?? {},
        b.is_judge ?? false,
        id,
      ],
    );
    if (!rows[0]) return app.httpErrors.notFound('模型不存在');
    return publicModel(rows[0]);
  });

  app.delete('/api/models/:id', async (req) => {
    const { id } = req.params as { id: string };
    const { rows } = await query(`UPDATE models SET status='archived' WHERE id=$1 RETURNING id`, [id]);
    if (!rows[0]) return app.httpErrors.notFound('模型不存在');
    return { ok: true, id: Number(id), status: 'archived' };
  });

  // 连接测试：用与评测完全相同的 provider 构建逻辑跑一次最小调用
  app.post('/api/models/:id/test', async (req) => {
    const { id } = req.params as { id: string };
    const { rows } = await query('SELECT * FROM models WHERE id=$1', [id]);
    if (!rows[0]) return app.httpErrors.notFound('模型不存在');
    const model = rows[0] as Record<string, unknown> & { api_key_enc: string | null };
    const provider = buildProvider(model as never);
    try {
      const r = await evaluate(
        {
          providers: [provider],
          prompts: [{ label: 'conn-test', raw: '连接测试：只回复两个字 OK' }],
        },
        { cache: false },
      );
      const res = (r.results as any[])[0];
      if (res.error) return { ok: false, message: String(res.error), latencyMs: res.latencyMs ?? null };
      return {
        ok: true,
        message: '连接成功',
        latencyMs: res.latencyMs ?? null,
        sample: String(res.response?.output ?? '').slice(0, 40),
      };
    } catch (e) {
      return { ok: false, message: (e as Error).message, latencyMs: null };
    }
  });
}
