import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { config } from './config.js';

// AES-256-GCM：密钥 32 字节，IV 12 字节，输出格式 iv:tag:ciphertext (hex)
function keyBuffer(): Buffer {
  const hex = config.encryptionKey;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('ENCRYPTION_KEY 必须是 64 位 hex（32 字节）');
  }
  return Buffer.from(hex, 'hex');
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBuffer(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decrypt(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(':');
  if (!ivHex || !tagHex || !dataHex) throw new Error('非法密文格式');
  const decipher = createDecipheriv('aes-256-gcm', keyBuffer(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return dec.toString('utf8');
}

/** 脱敏显示：sk-1234…abcd（保留首 3 尾 4） */
export function maskKey(plain: string): string {
  if (!plain) return '';
  if (plain.length <= 8) return '****';
  return `${plain.slice(0, 3)}…${plain.slice(-4)}`;
}
