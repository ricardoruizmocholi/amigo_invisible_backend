import { Router } from 'express';
import { HttpError } from '../errors.js';
import { sortByName } from '../users.js';

export function budgetRouter({ db }) {
  const router = Router();
  const listVotes = db.prepare(`
    SELECT budget_votes.min_amount, budget_votes.max_amount, users.id, users.name
    FROM budget_votes
    JOIN users ON users.id = budget_votes.user_id
  `);
  const countUsers = db.prepare('SELECT COUNT(*) AS total FROM users');
  const findMine = db.prepare('SELECT min_amount, max_amount FROM budget_votes WHERE user_id = ?');

  router.get('/', (req, res) => {
    const votes = sortByName(listVotes.all()).map((row) => ({
      user: { id: row.id, name: row.name },
      minAmount: row.min_amount,
      maxAmount: row.max_amount,
      isMe: row.id === req.user.id,
    }));
    const mine = findMine.get(req.user.id);

    res.json({
      totalPeople: countUsers.get().total,
      votes,
      myVote: mine ? { minAmount: mine.min_amount, maxAmount: mine.max_amount } : null,
      suggested: summarizeBudget(votes),
    });
  });

  router.put('/', (req, res) => {
    const { minAmount, maxAmount } = parseBudget(req.body ?? {});
    db.prepare(
      `
      INSERT INTO budget_votes (user_id, min_amount, max_amount)
      VALUES (?, ?, ?)
      ON CONFLICT (user_id) DO UPDATE SET
        min_amount = excluded.min_amount,
        max_amount = excluded.max_amount,
        created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      `,
    ).run(req.user.id, minAmount, maxAmount);
    res.status(204).end();
  });

  router.delete('/', (req, res) => {
    db.prepare('DELETE FROM budget_votes WHERE user_id = ?').run(req.user.id);
    res.status(204).end();
  });

  return router;
}

function parseBudget(body) {
  const minAmount = requireEuros(body.minAmount, 'El mínimo');
  const maxAmount = requireEuros(body.maxAmount, 'El máximo');
  if (maxAmount < minAmount) {
    throw new HttpError(400, 'El máximo no puede ser menor que el mínimo.');
  }
  return { minAmount, maxAmount };
}

function requireEuros(value, label) {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(amount) || amount < 1 || amount > 500) {
    throw new HttpError(400, `${label} tiene que ser un número entero entre 1 y 500 €.`);
  }
  return amount;
}

function summarizeBudget(votes) {
  if (votes.length === 0) return null;
  return {
    minAmount: median(votes.map((vote) => vote.minAmount)),
    maxAmount: median(votes.map((vote) => vote.maxAmount)),
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}
