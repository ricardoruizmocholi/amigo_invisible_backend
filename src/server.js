import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db.js';

const config = loadConfig();
const db = openDatabase(config.databasePath);
const app = createApp({ db, config });

app.listen(config.port, (error) => {
  if (error) throw error;
  console.log(`API del amigo invisible escuchando en http://localhost:${config.port}`);
});
