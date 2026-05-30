import * as bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;
const REFRESH_SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function hashToken(token: string): Promise<string> {
  return bcrypt.hash(token, REFRESH_SALT_ROUNDS);
}

export async function compareToken(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
