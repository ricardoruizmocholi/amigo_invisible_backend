import { Router } from 'express';
import { createSession } from '../auth.js';
import { HttpError } from '../errors.js';
import { createAttemptLimiter, hashPassword, verifyPassword } from '../security.js';
import { currentMonthIn } from '../time.js';
import { serializeUser } from '../users.js';
import { normalizeKey, parseEmployment, requireName, requirePassword } from '../validation.js';

export function authRouter({ db, config }) {
  const router = Router();
  const loginLimiter = createAttemptLimiter({ maxAttempts: 8, windowMs: 15 * 60 * 1000 });

  const findUserByKey = db.prepare('SELECT * FROM users WHERE name_key = ?');
  const findUserById = db.prepare('SELECT * FROM users WHERE id = ?');
  const countUsers = db.prepare('SELECT COUNT(*) AS total FROM users');
  const insertUser = db.prepare(`
    INSERT INTO users (name, name_key, password_hash, start_month, end_month, joins_secret_santa, is_admin)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  function ensureNameIsFree(nameKey, name) {
    if (findUserByKey.get(nameKey)) {
      throw new HttpError(
        409,
        `Ya hay alguien registrado como «${name}». Si eres tú, entra con tu contraseña; si no, añade tu apellido.`,
      );
    }
  }

  router.post('/register', async (req, res) => {
    const body = req.body ?? {};
    const name = requireName(body.name);
    const password = requirePassword(body.password);
    const { startMonth, endMonth } = parseEmployment(body, currentMonthIn(config.timeZone));
    const joinsSecretSanta = body.joinsSecretSanta !== false;
    const nameKey = normalizeKey(name);

    ensureNameIsFree(nameKey, name);
    const passwordHash = await hashPassword(password);
    // Mientras se calculaba el hash, otra petición ha podido registrar el mismo nombre.
    ensureNameIsFree(nameKey, name);

    const isFirstUser = countUsers.get().total === 0;
    const { lastInsertRowid } = insertUser.run(
      name,
      nameKey,
      passwordHash,
      startMonth,
      endMonth,
      joinsSecretSanta ? 1 : 0,
      isFirstUser ? 1 : 0,
    );

    const user = findUserById.get(lastInsertRowid);
    res.status(201).json({ token: createSession(db, user.id), user: serializeUser(user) });
  });

  router.post('/login', async (req, res) => {
    const body = req.body ?? {};
    const nameKey = normalizeKey(body.name);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!nameKey || !password) throw new HttpError(400, 'Escribe tu nombre y tu contraseña.');

    if (loginLimiter.isBlocked(nameKey)) {
      throw new HttpError(429, 'Demasiados intentos fallidos. Espera 15 minutos y vuelve a probar.');
    }

    const user = findUserByKey.get(nameKey);
    if (!user) throw new HttpError(401, 'No hay nadie registrado con ese nombre. ¿Te registraste con otro?');

    // Las contraseñas temporales son solo mayúsculas y números; así da igual cómo las escriba el móvil.
    const candidate = user.must_change_password ? password.trim().toUpperCase() : password;
    if (!(await verifyPassword(candidate, user.password_hash))) {
      loginLimiter.registerFailure(nameKey);
      throw new HttpError(401, 'La contraseña no es correcta.');
    }

    loginLimiter.clear(nameKey);
    res.json({ token: createSession(db, user.id), user: serializeUser(user) });
  });

  router.get('/me', (req, res) => {
    res.json({ user: req.user ? serializeUser(req.user) : null });
  });

  router.post('/logout', (req, res) => {
    if (req.sessionTokenHash) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.sessionTokenHash);
    res.status(204).end();
  });

  return router;
}
