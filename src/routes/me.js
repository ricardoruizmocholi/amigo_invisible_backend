import { Router } from 'express';
import { requireReadyUser, requireUser } from '../auth.js';
import { HttpError } from '../errors.js';
import { isInDraw } from '../secretSanta.js';
import { hashPassword, verifyPassword } from '../security.js';
import { currentMonthIn } from '../time.js';
import { serializeUser } from '../users.js';
import { parseEmployment, requirePassword } from '../validation.js';

export function meRouter({ db, config }) {
  const router = Router();
  const findUserById = db.prepare('SELECT * FROM users WHERE id = ?');

  router.patch('/', requireReadyUser, (req, res) => {
    const body = req.body ?? {};
    const { startMonth, endMonth } = parseEmployment(body, currentMonthIn(config.timeZone));
    const joinsSecretSanta = body.joinsSecretSanta !== false;
    const user = req.user;

    const changed =
      startMonth !== user.start_month ||
      endMonth !== user.end_month ||
      joinsSecretSanta !== Boolean(user.joins_secret_santa);
    if (changed && isInDraw(db, user.id)) {
      throw new HttpError(
        409,
        'El sorteo ya está hecho. Si necesitas cambiar tus datos, avisa al organizador para que lo repita.',
      );
    }

    db.prepare('UPDATE users SET start_month = ?, end_month = ?, joins_secret_santa = ? WHERE id = ?').run(
      startMonth,
      endMonth,
      joinsSecretSanta ? 1 : 0,
      user.id,
    );
    res.json({ user: serializeUser(findUserById.get(user.id)) });
  });

  router.put('/password', requireUser, async (req, res) => {
    const body = req.body ?? {};
    const newPassword = requirePassword(body.newPassword, 'La contraseña nueva');
    const user = req.user;

    if (!user.must_change_password) {
      const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
      if (!(await verifyPassword(currentPassword, user.password_hash))) {
        throw new HttpError(400, 'La contraseña actual no es correcta.');
      }
    }

    const passwordHash = await hashPassword(newPassword);
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(passwordHash, user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(user.id, req.sessionTokenHash);
    res.json({ user: serializeUser(findUserById.get(user.id)) });
  });

  return router;
}
