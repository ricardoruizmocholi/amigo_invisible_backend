import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db.js';
import { periodsOverlap } from '../src/draw.js';
import { currentMonthIn } from '../src/time.js';

const config = loadConfig({ DATABASE_PATH: ':memory:' });
const nextYear = new Date().getFullYear() + 1;
let server;
let baseUrl;

before(async () => {
  const app = createApp({ db: openDatabase(':memory:'), config });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

async function call(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: response.status === 204 ? null : await response.json() };
}

async function register(name, startMonth, endMonth = null, extra = {}) {
  const response = await call('/auth/register', {
    method: 'POST',
    body: { name, password: '1234', startMonth, endMonth, ...extra },
  });
  assert.equal(response.status, 201, JSON.stringify(response.data));
  return response.data;
}

const people = {};

test('el primero en registrarse es el organizador y los nombres no se repiten', async () => {
  people.ricardo = await register('Ricardo Ruiz', '2021-03');
  assert.equal(people.ricardo.user.isAdmin, true);

  people.lucia = await register('Lucía', '2019-05');
  assert.equal(people.lucia.user.isAdmin, false);

  const duplicated = await call('/auth/register', {
    method: 'POST',
    body: { name: '  LUCIA ', password: '1234', startMonth: '2020-01' },
  });
  assert.equal(duplicated.status, 409);

  const futureStart = await call('/auth/register', {
    method: 'POST',
    body: { name: 'Futuro', password: '1234', startMonth: `${nextYear}-01` },
  });
  assert.equal(futureStart.status, 400);

  const endBeforeStart = await call('/auth/register', {
    method: 'POST',
    body: { name: 'Al revés', password: '1234', startMonth: '2022-01', endMonth: '2021-01' },
  });
  assert.equal(endBeforeStart.status, 400);
});

test('login con nombre y contraseña', async () => {
  assert.equal((await call('/auth/login', { method: 'POST', body: { name: 'lucia', password: 'mal' } })).status, 401);
  assert.equal((await call('/auth/login', { method: 'POST', body: { name: 'Nadie', password: '1234' } })).status, 401);

  const login = await call('/auth/login', { method: 'POST', body: { name: 'lucía', password: '1234' } });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.name, 'Lucía');

  const me = await call('/auth/me', { token: login.data.token });
  assert.equal(me.data.user.id, people.lucia.user.id);
  assert.deepEqual((await call('/auth/me')).data, { user: null });
  assert.equal((await call('/proposals')).status, 401);
});

test('propuestas de sitio y fecha con votos', async () => {
  people.marta = await register('Marta', '2018-01', '2022-12');

  const created = await call('/proposals', {
    method: 'POST',
    token: people.lucia.token,
    body: { kind: 'place', title: 'Arrocería del puerto', details: 'https://example.com/menu\n35 € por persona' },
  });
  assert.equal(created.status, 201);
  const placeId = created.data.id;

  const duplicated = await call('/proposals', {
    method: 'POST',
    token: people.marta.token,
    body: { kind: 'place', title: 'arroceria  del PUERTO' },
  });
  assert.equal(duplicated.status, 409);

  const pastDate = await call('/proposals', {
    method: 'POST',
    token: people.marta.token,
    body: { kind: 'date', startsAt: '2020-12-18T21:00' },
  });
  assert.equal(pastDate.status, 400);

  const date = await call('/proposals', {
    method: 'POST',
    token: people.marta.token,
    body: { kind: 'date', startsAt: `${nextYear}-12-18T21:00` },
  });
  assert.equal(date.status, 201);

  assert.equal((await call(`/proposals/${placeId}/vote`, { method: 'PUT', token: people.ricardo.token })).status, 204);
  assert.equal((await call(`/proposals/${placeId}/vote`, { method: 'PUT', token: people.ricardo.token })).status, 204);

  let list = (await call('/proposals', { token: people.ricardo.token })).data;
  assert.equal(list.totalPeople, 3);
  assert.equal(list.places[0].votes, 2, 'el autor vota su propuesta automáticamente');
  assert.equal(list.places[0].votedByMe, true);
  assert.equal(list.places[0].canDelete, true, 'el organizador puede borrar cualquier propuesta');
  assert.equal(list.dates[0].startsAt, `${nextYear}-12-18T21:00`);

  assert.equal((await call(`/proposals/${placeId}/vote`, { method: 'DELETE', token: people.ricardo.token })).status, 204);
  list = (await call('/proposals', { token: people.marta.token })).data;
  assert.equal(list.places[0].votes, 1);
  assert.equal(list.places[0].canDelete, false);

  assert.equal((await call(`/proposals/${placeId}`, { method: 'DELETE', token: people.marta.token })).status, 403);
  assert.equal((await call(`/proposals/${placeId}/chosen`, { method: 'PUT', token: people.marta.token })).status, 403);
  assert.equal((await call(`/proposals/${placeId}/chosen`, { method: 'PUT', token: people.ricardo.token })).status, 204);
  list = (await call('/proposals', { token: people.marta.token })).data;
  assert.equal(list.places[0].chosen, true);
});

test('solo el organizador hace el sorteo, y avisa si alguien no coincidió con nadie', async () => {
  people.antonio = await register('Antonio', '2005-01', '2008-06');

  assert.equal((await call('/admin/draw', { method: 'POST', token: people.lucia.token })).status, 403);

  const blocked = await call('/admin/draw', { method: 'POST', token: people.ricardo.token });
  assert.equal(blocked.status, 422);
  assert.match(blocked.data.error, /Antonio/);

  const overview = (await call('/admin/overview', { token: people.ricardo.token })).data;
  assert.equal(overview.users.find((user) => user.name === 'Antonio').overlapCount, 0);

  const optOut = await call('/me', {
    method: 'PATCH',
    token: people.antonio.token,
    body: { startMonth: '2005-01', endMonth: '2008-06', joinsSecretSanta: false },
  });
  assert.equal(optOut.status, 200);
  assert.equal(optOut.data.user.joinsSecretSanta, false);
});

test('cada participante solo ve a quién le regala él', async () => {
  people.pablo = await register('Pablo', '2023-02');
  people.sara = await register('Sara', '2020-09');

  const draw = await call('/admin/draw', { method: 'POST', token: people.ricardo.token });
  assert.equal(draw.status, 201, JSON.stringify(draw.data));
  assert.equal(draw.data.participantCount, 5);
  assert.equal((await call('/admin/draw', { method: 'POST', token: people.ricardo.token })).status, 409);

  const currentMonth = currentMonthIn(config.timeZone);
  const participants = ['ricardo', 'lucia', 'marta', 'pablo', 'sara'];
  const receivers = new Set();
  for (const key of participants) {
    const { data } = await call('/secret-santa', { token: people[key].token });
    assert.equal(data.drawn, true);
    assert.equal(data.inDraw, true);
    assert.notEqual(data.receiver.id, people[key].user.id);
    receivers.add(data.receiver.id);

    const receiverKey = participants.find((other) => people[other].user.id === data.receiver.id);
    assert.ok(periodsOverlap(people[key].user, people[receiverKey].user, currentMonth));
  }
  assert.equal(receivers.size, participants.length);

  const outsider = (await call('/secret-santa', { token: people.antonio.token })).data;
  assert.equal(outsider.inDraw, false);
  assert.equal(outsider.receiver, null);

  const overview = (await call('/admin/overview', { token: people.ricardo.token })).data;
  assert.equal(JSON.stringify(overview).includes('receiver'), false, 'el organizador no ve las parejas');

  const lockedDates = await call('/me', {
    method: 'PATCH',
    token: people.pablo.token,
    body: { startMonth: '2022-02', endMonth: null, joinsSecretSanta: true },
  });
  assert.equal(lockedDates.status, 409);
});

test('restablecer contraseña obliga a elegir una nueva', async () => {
  const reset = await call(`/admin/users/${people.sara.user.id}/reset-password`, {
    method: 'POST',
    token: people.ricardo.token,
  });
  assert.equal(reset.status, 200);
  assert.match(reset.data.temporaryPassword, /^[A-Z2-9]{8}$/);
  assert.equal((await call('/auth/me', { token: people.sara.token })).data.user, null, 'cierra sus sesiones');

  const login = await call('/auth/login', {
    method: 'POST',
    body: { name: 'Sara', password: reset.data.temporaryPassword.toLowerCase() },
  });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.mustChangePassword, true);
  assert.equal((await call('/proposals', { token: login.data.token })).status, 403);

  const changed = await call('/me/password', {
    method: 'PUT',
    token: login.data.token,
    body: { newPassword: 'nueva-clave' },
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.user.mustChangePassword, false);
  assert.equal((await call('/proposals', { token: login.data.token })).status, 200);

  const wrongCurrent = await call('/me/password', {
    method: 'PUT',
    token: login.data.token,
    body: { currentPassword: 'otra', newPassword: 'otra-mas' },
  });
  assert.equal(wrongCurrent.status, 400);
});

test('borrar a alguien del sorteo lo anula para repetirlo', async () => {
  assert.equal(
    (await call(`/admin/users/${people.ricardo.user.id}`, { method: 'DELETE', token: people.ricardo.token })).status,
    400,
  );

  const removed = await call(`/admin/users/${people.pablo.user.id}`, { method: 'DELETE', token: people.ricardo.token });
  assert.equal(removed.status, 200);
  assert.equal(removed.data.drawReset, true);

  const { data } = await call('/secret-santa', { token: people.lucia.token });
  assert.equal(data.drawn, false);
  assert.equal(data.receiver, null);

  const redo = await call('/admin/draw', { method: 'POST', token: people.ricardo.token, body: { redo: true } });
  assert.equal(redo.status, 201);
  assert.equal(redo.data.participantCount, 4);
});
