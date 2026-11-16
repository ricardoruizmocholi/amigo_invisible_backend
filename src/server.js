import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db.js';

const config = loadConfig();
const db = openDatabase(config.databasePath);
const app = createApp({ db, config });

app.listen(config.port, '0.0.0.0', (error) => {
  if (error) throw error;
  console.log(`API del amigo invisible escuchando en http://0.0.0.0:${config.port}`);
  console.log(`CORS origins: ${config.corsOrigins.join(', ')}`);
  console.log(`Database: ${config.databasePath}`);
});
