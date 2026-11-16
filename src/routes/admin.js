import { Router } from 'express';
import { transaction } from '../db.js';
import { DrawError, drawSecretSanta, overlapCounts } from '../draw.js';
import { HttpError } from '../errors.js';
import { clearDraw, getDrawnAt, isInDraw, saveDraw } from '../secretSanta.js';
import { createTemporaryPassword, hashPassword } from '../security.js';
import { currentMonthIn } from '../time.js';
import { serializeUser, sortByName, toPerson } from '../users.js';
import { parseId } from '../validation.js';

export function adminRouter({ db, config }) {
  const router = Router();

  const listUsers = db.prepare('SELECT * FROM users');
  const listParticipants = db.prepare('SELECT * FROM users WHERE joins_secret_santa = 1');
  const listGivers = db.prepare('SELECT giver_id FROM assignments');
  const findUserById = db.prepare('SELECT * FROM users WHERE id = ?');

  function getUser(rawId) {
    const user = findUserById.get(parseId(rawId));
    if (!user) throw new HttpError(404, 'Esa persona ya no está registrada.');
    return user;
  }

  router.get('/overview', (req, res) => {
    const users = listUsers.all();
    const drawnAt = getDrawnAt(db);
    const inDraw = new Set(listGivers.all().map((row) => row.giver_id));
    const participants = users.filter((user) => user.joins_secret_santa).map(toPerson);
    const overlaps = overlapCounts(participants, currentMonthIn(config.timeZone));

    res.json({
      draw: {
        drawn: Boolean(drawnAt),
        drawnAt,
        participantCount: drawnAt ? inDraw.size : participants.length,
        pendingPeople: drawnAt ? sortByName(participants.filter((person) => !inDraw.has(person.id))).map((person) => person.name) : [],
      },
      users: sortByName(users).map((user) => ({
        ...serializeUser(user),
        createdAt: user.created_at,
        inDraw: inDraw.has(user.id),
        overlapCount: overlaps.get(user.id) ?? null,
      })),
    });
  });

  router.post('/draw', (req, res) => {
    const redo = req.body?.redo === true;
    if (getDrawnAt(db) && !redo) throw new HttpError(409, 'El sorteo ya está hecho.');

    const participants = listParticipants.all().map(toPerson);
    let pairs;
    try {
      pairs = drawSecretSanta(participants, { currentMonth: currentMonthIn(config.timeZone) });
    } catch (error) {
      if (error instanceof DrawError) throw new HttpError(422, error.message, error.details);
      throw error;
    }

    const drawnAt = new Date().toISOString();
    transaction(db, () => saveDraw(db, pairs, drawnAt));
    res.status(201).json({ drawnAt, participantCount: pairs.length });
  });

  router.delete('/draw', (req, res) => {
    transaction(db, () => clearDraw(db));
    res.status(204).end();
  });

  router.post('/users/:id/reset-password', async (req, res) => {
    const user = getUser(req.params.id);
    if (user.id === req.user.id) throw new HttpError(400, 'Tu propia contraseña puedes cambiarla desde tu perfil.');

    const temporaryPassword = createTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    transaction(db, () => {
      db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(passwordHash, user.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    });
    res.json({ temporaryPassword });
  });

  router.delete('/users/:id', (req, res) => {
    const user = getUser(req.params.id);
    if (user.id === req.user.id) throw new HttpError(400, 'No puedes borrarte a ti mismo.');

    const drawReset = transaction(db, () => {
      const wasInDraw = isInDraw(db, user.id);
      if (wasInDraw) clearDraw(db);
      db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
      return wasInDraw;
    });
    res.json({ drawReset });
  });

  return router;
}
