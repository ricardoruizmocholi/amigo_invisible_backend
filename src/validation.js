import { HttpError } from './errors.js';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d$/;
const FIRST_MONTH = '2000-01';

export function cleanLine(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

export function normalizeKey(value) {
  return cleanLine(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function requireName(value) {
  const name = cleanLine(value);
  if (name.length < 2 || name.length > 40) {
    throw new HttpError(400, 'Escribe tu nombre (entre 2 y 40 caracteres).');
  }
  return name;
}

export function requirePassword(value, label = 'La contraseña') {
  if (typeof value !== 'string' || value.length < 4) {
    throw new HttpError(400, `${label} tiene que tener al menos 4 caracteres.`);
  }
  if (value.length > 128) throw new HttpError(400, `${label} es demasiado larga.`);
  return value;
}

export function parseEmployment({ startMonth, endMonth }, currentMonth) {
  if (!isMonth(startMonth)) throw new HttpError(400, 'Indica el mes y el año en que empezaste en Khambu.');
  if (startMonth < FIRST_MONTH) throw new HttpError(400, 'La fecha de inicio no es válida.');
  if (startMonth > currentMonth) throw new HttpError(400, 'La fecha de inicio no puede ser futura.');

  if (endMonth === undefined || endMonth === null || endMonth === '') return { startMonth, endMonth: null };

  if (!isMonth(endMonth)) throw new HttpError(400, 'Indica el mes y el año en que terminaste en Khambu.');
  if (endMonth < startMonth) throw new HttpError(400, 'La fecha de fin no puede ser anterior a la de inicio.');
  if (endMonth > currentMonth) throw new HttpError(400, 'La fecha de fin no puede ser futura.');
  return { startMonth, endMonth };
}

export function requireText(value, { min, max, message }) {
  const text = cleanLine(value);
  if (text.length < min || text.length > max) throw new HttpError(400, message);
  return text;
}

export function optionalNotes(value, { max, label }) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new HttpError(400, `${label} no son válidos.`);

  const notes = value
    .trim()
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
  if (notes.length > max) throw new HttpError(400, `${label} pueden tener como mucho ${max} caracteres.`);
  return notes || null;
}

export function requireDateTime(value, today) {
  const match = typeof value === 'string' ? DATE_TIME_PATTERN.exec(value) : null;
  if (!match) throw new HttpError(400, 'Indica el día y la hora.');

  const [year, month, day] = match.slice(1, 4).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new HttpError(400, 'Ese día no existe.');
  }
  if (value.slice(0, 10) < today) throw new HttpError(400, 'El día no puede ser anterior a hoy.');
  return value;
}

export function parseId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(404, 'No existe.');
  return id;
}

function isMonth(value) {
  return typeof value === 'string' && MONTH_PATTERN.test(value);
}
