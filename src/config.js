import { fileURLToPath } from 'node:url';

const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5173',
  'https://khambu.ricardorm.es',
  'http://khambu.ricardorm.es',
];

export function loadConfig(env = process.env) {
  const fromEnv = (env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    port: Number(env.PORT) || 3001,
    databasePath: env.DATABASE_PATH || fileURLToPath(new URL('../data/amigo-invisible.db', import.meta.url)),
    corsOrigins: [...new Set([...DEFAULT_CORS_ORIGINS, ...fromEnv])],
    timeZone: env.TIME_ZONE || 'Europe/Madrid',
  };
}
