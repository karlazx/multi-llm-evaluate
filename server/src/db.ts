import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, './migrations');

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

/** 极简迁移器：schema_migrations 记录已应用文件，按文件名顺序执行 */
export async function migrate(): Promise<string[]> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT now()
  )`);

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const applied = new Set(
    (await pool.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name),
  );

  const done: string[] = [];
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = readFileSync(path.join(migrationsDir, f), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
      await client.query('COMMIT');
      done.push(f);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  return done;
}
