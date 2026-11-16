import { Router } from 'express';
import { getDrawnAt } from '../secretSanta.js';
import { sortByName } from '../users.js';

export function secretSantaRouter({ db }) {
  const router = Router();

  const listDrawParticipants = db.prepare(`
    SELECT users.id, users.name
    FROM assignments
    JOIN users ON users.id = assignments.giver_id
  `);
  const listSignedUp = db.prepare('SELECT id, name FROM users WHERE joins_secret_santa = 1');
  const findReceiver = db.prepare(`
    SELECT users.id, users.name
    FROM assignments
    JOIN users ON users.id = assignments.receiver_id
    WHERE assignments.giver_id = ?
  `);

  router.get('/', (req, res) => {
    const drawnAt = getDrawnAt(db);
    const participants = drawnAt ? listDrawParticipants.all() : listSignedUp.all();
    const receiver = drawnAt ? findReceiver.get(req.user.id) : undefined;

    res.json({
      drawn: Boolean(drawnAt),
      drawnAt,
      participants: sortByName(participants).map(({ id, name }) => ({ id, name })),
      joins: Boolean(req.user.joins_secret_santa),
      inDraw: Boolean(receiver),
      receiver: receiver ? { id: receiver.id, name: receiver.name } : null,
    });
  });

  return router;
}
