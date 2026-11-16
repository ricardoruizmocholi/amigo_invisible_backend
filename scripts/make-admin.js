import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db.js';
import { normalizeKey } from '../src/validation.js';

const name = process.argv.slice(2).join(' ').trim();
if (!name) {
  console.error('Uso: npm run make-admin -- "Nombre con el que se registró"');
  process.exit(1);
}

const db = openDatabase(loadConfig().databasePath);
const { changes } = db.prepare('UPDATE users SET is_admin = 1 WHERE name_key = ?').run(normalizeKey(name));
if (changes === 0) {
  console.error(`No hay nadie registrado como «${name}».`);
  process.exit(1);
}
console.log(`«${name}» ya es organizador.`);
