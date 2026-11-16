export function getDrawnAt(db) {
  return db.prepare("SELECT value FROM settings WHERE key = 'drawn_at'").get()?.value ?? null;
}

export function isInDraw(db, userId) {
  return Boolean(db.prepare('SELECT 1 FROM assignments WHERE giver_id = ? OR receiver_id = ?').get(userId, userId));
}

export function saveDraw(db, pairs, drawnAt) {
  clearDraw(db);
  const insert = db.prepare('INSERT INTO assignments (giver_id, receiver_id) VALUES (?, ?)');
  for (const { giverId, receiverId } of pairs) insert.run(giverId, receiverId);
  db.prepare("INSERT INTO settings (key, value) VALUES ('drawn_at', ?)").run(drawnAt);
}

export function clearDraw(db) {
  db.exec("DELETE FROM assignments; DELETE FROM settings WHERE key = 'drawn_at';");
}
