import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 简单 .env 加载（无外部依赖；已存在的环境变量优先）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../../.env');
try {
  const txt = readFileSync(envPath, 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  }
} catch {
  // .env 不存在时忽略
}

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? '',
  encryptionKey: process.env.ENCRYPTION_KEY ?? '',
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '127.0.0.1',
  // 原始产出快照落盘目录（相对于仓库根）
  snapshotDir: path.resolve(__dirname, '../../data/snapshots'),
};

export function assertConfig() {
  const missing: string[] = [];
  if (!config.databaseUrl) missing.push('DATABASE_URL');
  if (!config.encryptionKey) missing.push('ENCRYPTION_KEY');
  if (missing.length) {
    throw new Error(`缺少环境变量：${missing.join(', ')}（请检查 .env）`);
  }
}
