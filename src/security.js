import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;
const TEMPORARY_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH);
  return `scrypt:${salt.toString('base64')}:${key.toString('base64')}`;
}

export async function verifyPassword(password, storedHash) {
  const [scheme, salt, key] = storedHash.split(':');
  if (scheme !== 'scrypt' || !salt || !key) return false;

  const expected = Buffer.from(key, 'base64');
  const actual = await scryptAsync(password.normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

export function createSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function createTemporaryPassword(length = 8) {
  return Array.from(
    { length },
    () => TEMPORARY_PASSWORD_ALPHABET[randomInt(TEMPORARY_PASSWORD_ALPHABET.length)],
  ).join('');
}

export function createAttemptLimiter({ maxAttempts, windowMs }) {
  const attempts = new Map();

  function current(key) {
    const entry = attempts.get(key);
    if (entry && entry.resetAt <= Date.now()) {
      attempts.delete(key);
      return undefined;
    }
    return entry;
  }

  return {
    isBlocked: (key) => (current(key)?.count ?? 0) >= maxAttempts,
    registerFailure(key) {
      const entry = current(key);
      if (entry) entry.count += 1;
      else attempts.set(key, { count: 1, resetAt: Date.now() + windowMs });
    },
    clear: (key) => attempts.delete(key),
  };
}
