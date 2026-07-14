import * as bcrypt from 'bcryptjs';
import { createHash, timingSafeEqual } from 'crypto';

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// SHA-256, not bcrypt: bcrypt truncates input at 72 bytes, and JWTs issued to the
// same user share their first 72 bytes — bcrypt would match every token ever issued.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function compareToken(plain: string, hash: string): boolean {
  const plainHash = createHash('sha256').update(plain).digest();
  const storedHash = Buffer.from(hash, 'hex');
  return plainHash.length === storedHash.length && timingSafeEqual(plainHash, storedHash);
}
