import { readFileSync } from 'node:fs';
import path from 'node:path';

// 简单 .env 加载（无外部依赖；已存在的环境变量优先）
// 路径锚定进程工作目录：本地 npm 脚本与容器（WORKDIR /app）均从仓库根启动
const envPath = path.resolve(process.cwd(), '.env');
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
  snapshotDir: path.resolve(process.cwd(), 'data/snapshots'),
};

export function assertConfig() {
  const missing: string[] = [];
  if (!config.databaseUrl) missing.push('DATABASE_URL');
  if (!config.encryptionKey) missing.push('ENCRYPTION_KEY');
  if (missing.length) {
    throw new Error(`缺少环境变量：${missing.join(', ')}（请检查 .env）`);
  }
}
