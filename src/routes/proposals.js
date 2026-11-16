import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { transaction } from '../db.js';
import { HttpError } from '../errors.js';
import { todayIn } from '../time.js';
import { normalizeKey, optionalNotes, parseId, requireDateTime, requireText } from '../validation.js';

const KINDS = new Set(['place', 'date']);
const MAX_PROPOSALS_PER_PERSON = 10;

export function proposalsRouter({ db, config }) {
  const router = Router();

  const listProposals = db.prepare(`
    SELECT proposals.*, users.name AS author_name
    FROM proposals
    JOIN users ON users.id = proposals.author_id
    ORDER BY proposals.created_at, proposals.id
  `);
  const listVotes = db.prepare(`
    SELECT votes.proposal_id, users.id AS user_id, users.name
    FROM votes
    JOIN users ON users.id = votes.user_id
    ORDER BY votes.created_at, users.id
  `);
  const countUsers = db.prepare('SELECT COUNT(*) AS total FROM users');
  const findProposal = db.prepare('SELECT * FROM proposals WHERE id = ?');

  function getProposal(rawId) {
    const proposal = findProposal.get(parseId(rawId));
    if (!proposal) throw new HttpError(404, 'Esa propuesta ya no existe.');
    return proposal;
  }

  router.get('/', (req, res) => {
    const votersByProposal = new Map();
    for (const vote of listVotes.all()) {
      if (!votersByProposal.has(vote.proposal_id)) votersByProposal.set(vote.proposal_id, []);
      votersByProposal.get(vote.proposal_id).push({ id: vote.user_id, name: vote.name });
    }

    const proposals = listProposals
      .all()
      .map((row) => serializeProposal(row, votersByProposal.get(row.id) ?? [], req.user));

    res.json({
      totalPeople: countUsers.get().total,
      places: proposals.filter((proposal) => proposal.kind === 'place'),
      dates: proposals
        .filter((proposal) => proposal.kind === 'date')
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    });
  });

  router.post('/', (req, res) => {
    const body = req.body ?? {};
    const { kind } = body;
    if (!KINDS.has(kind)) throw new HttpError(400, 'Tipo de propuesta no válido.');

    const details = optionalNotes(body.details, { max: 300, label: 'Los detalles' });
    let title = null;
    let startsAt = null;
    let dedupeKey;
    if (kind === 'place') {
      title = requireText(body.title, { min: 2, max: 80, message: 'Escribe el nombre del sitio (entre 2 y 80 caracteres).' });
      dedupeKey = normalizeKey(title);
    } else {
      startsAt = requireDateTime(body.startsAt, todayIn(config.timeZone));
      dedupeKey = startsAt;
    }

    const { total } = db
      .prepare('SELECT COUNT(*) AS total FROM proposals WHERE author_id = ? AND kind = ?')
      .get(req.user.id, kind);
    if (total >= MAX_PROPOSALS_PER_PERSON) {
      throw new HttpError(409, 'Ya has hecho muchas propuestas de este tipo. Borra alguna antes de añadir otra.');
    }
    if (db.prepare('SELECT 1 FROM proposals WHERE kind = ? AND dedupe_key = ?').get(kind, dedupeKey)) {
      throw new HttpError(
        409,
        kind === 'place' ? 'Ese sitio ya está propuesto: búscalo y vótalo.' : 'Ese día y hora ya están propuestos: búscalos y vótalos.',
      );
    }

    const id = transaction(db, () => {
      const { lastInsertRowid } = db
        .prepare('INSERT INTO proposals (kind, title, starts_at, details, dedupe_key, author_id) VALUES (?, ?, ?, ?, ?, ?)')
        .run(kind, title, startsAt, details, dedupeKey, req.user.id);
      db.prepare('INSERT INTO votes (proposal_id, user_id) VALUES (?, ?)').run(lastInsertRowid, req.user.id);
      return Number(lastInsertRowid);
    });

    res.status(201).json({ id });
  });

  router.delete('/:id', (req, res) => {
    const proposal = getProposal(req.params.id);
    if (proposal.author_id !== req.user.id && !req.user.is_admin) {
      throw new HttpError(403, 'Solo puedes borrar tus propias propuestas.');
    }
    db.prepare('DELETE FROM proposals WHERE id = ?').run(proposal.id);
    res.status(204).end();
  });

  router.put('/:id/vote', (req, res) => {
    const proposal = getProposal(req.params.id);
    db.prepare('INSERT OR IGNORE INTO votes (proposal_id, user_id) VALUES (?, ?)').run(proposal.id, req.user.id);
    res.status(204).end();
  });

  router.delete('/:id/vote', (req, res) => {
    const proposal = getProposal(req.params.id);
    db.prepare('DELETE FROM votes WHERE proposal_id = ? AND user_id = ?').run(proposal.id, req.user.id);
    res.status(204).end();
  });

  router.put('/:id/chosen', requireAdmin, (req, res) => {
    const proposal = getProposal(req.params.id);
    transaction(db, () => {
      db.prepare('UPDATE proposals SET chosen = 0 WHERE kind = ?').run(proposal.kind);
      db.prepare('UPDATE proposals SET chosen = 1 WHERE id = ?').run(proposal.id);
    });
    res.status(204).end();
  });

  router.delete('/:id/chosen', requireAdmin, (req, res) => {
    const proposal = getProposal(req.params.id);
    db.prepare('UPDATE proposals SET chosen = 0 WHERE id = ?').run(proposal.id);
    res.status(204).end();
  });

  return router;
}

function serializeProposal(row, voters, user) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    startsAt: row.starts_at,
    details: row.details,
    chosen: Boolean(row.chosen),
    author: { id: row.author_id, name: row.author_name },
    voters,
    votes: voters.length,
    votedByMe: voters.some((voter) => voter.id === user.id),
    canDelete: row.author_id === user.id || Boolean(user.is_admin),
  };
}
