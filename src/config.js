import { fileURLToPath } from 'node:url';

export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT) || 3001,
    databasePath: env.DATABASE_PATH || fileURLToPath(new URL('../data/amigo-invisible.db', import.meta.url)),
    corsOrigins: (env.CORS_ORIGIN || 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    timeZone: env.TIME_ZONE || 'Europe/Madrid',
  };
}
