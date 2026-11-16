import { HttpError } from './errors.js';
import { createSessionToken, hashSessionToken } from './security.js';

const SESSION_DURATION_MS = 180 * 24 * 60 * 60 * 1000;

export function createSession(db, userId) {
  const token = createSessionToken();
  const now = new Date();

  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now.toISOString());
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
    hashSessionToken(token),
    userId,
    new Date(now.getTime() + SESSION_DURATION_MS).toISOString(),
  );
  return token;
}

export function authenticate(db) {
  const findSessionUser = db.prepare(`
    SELECT users.*
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `);

  return (req, res, next) => {
    const [scheme, token] = (req.get('authorization') ?? '').split(' ');
    if (scheme === 'Bearer' && token) {
      req.sessionTokenHash = hashSessionToken(token);
      req.user = findSessionUser.get(req.sessionTokenHash, new Date().toISOString());
    }
    next();
  };
}

export function requireUser(req, res, next) {
  if (!req.user) throw new HttpError(401, 'Tu sesión ha caducado. Vuelve a entrar.');
  next();
}

export function requireReadyUser(req, res, next) {
  if (!req.user) throw new HttpError(401, 'Tu sesión ha caducado. Vuelve a entrar.');
  if (req.user.must_change_password) throw new HttpError(403, 'Antes tienes que elegir una contraseña nueva.');
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) throw new HttpError(403, 'Solo el organizador puede hacer esto.');
  next();
}
