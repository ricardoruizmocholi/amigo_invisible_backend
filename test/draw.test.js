import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DrawError, drawSecretSanta, periodsOverlap } from '../src/draw.js';

const NOW = '2026-11';
const person = (id, startMonth, endMonth = null) => ({ id, name: `Persona ${id}`, startMonth, endMonth });

function assertValidDraw(people, pairs) {
  const byId = new Map(people.map((p) => [p.id, p]));
  assert.equal(pairs.length, people.length);
  assert.equal(new Set(pairs.map((pair) => pair.giverId)).size, people.length);
  assert.equal(new Set(pairs.map((pair) => pair.receiverId)).size, people.length);

  for (const { giverId, receiverId } of pairs) {
    assert.notEqual(giverId, receiverId);
    assert.ok(
      periodsOverlap(byId.get(giverId), byId.get(receiverId), NOW),
      `${giverId} y ${receiverId} no coincidieron`,
    );
  }
}

test('dos etapas se solapan si comparten al menos un mes', () => {
  assert.ok(periodsOverlap(person(1, '2020-01', '2021-06'), person(2, '2021-06'), NOW));
  assert.ok(!periodsOverlap(person(1, '2020-01', '2021-05'), person(2, '2021-06'), NOW));
  assert.ok(periodsOverlap(person(1, '2019-03'), person(2, '2024-10'), NOW));
});

test('todos regalan y reciben una vez, y solo a gente con la que coincidieron', () => {
  const people = [
    person(1, '2018-01', '2020-12'),
    person(2, '2019-05', '2022-03'),
    person(3, '2020-02'),
    person(4, '2021-01'),
    person(5, '2022-09'),
    person(6, '2023-04'),
    person(7, '2015-01', '2019-12'),
    person(8, '2017-06', '2020-03'),
  ];

  for (let run = 0; run < 300; run += 1) {
    assertValidDraw(people, drawSecretSanta(people, { currentMonth: NOW }));
  }
});

test('el sorteo cambia de una vez a otra', () => {
  const people = Array.from({ length: 8 }, (_, index) => person(index + 1, '2020-01'));
  const results = new Set();
  for (let run = 0; run < 30; run += 1) {
    results.add(JSON.stringify(drawSecretSanta(people, { currentMonth: NOW })));
  }
  assert.ok(results.size > 1);
});

test('evita parejas que se regalan mutuamente cuando se puede', () => {
  const people = Array.from({ length: 6 }, (_, index) => person(index + 1, '2020-01'));
  for (let run = 0; run < 100; run += 1) {
    const receiverOf = new Map(drawSecretSanta(people, { currentMonth: NOW }).map((p) => [p.giverId, p.receiverId]));
    for (const [giver, receiver] of receiverOf) assert.notEqual(receiverOf.get(receiver), giver);
  }
});

test('avisa de quién no coincidió con nadie', () => {
  const people = [person(1, '2010-01', '2011-01'), person(2, '2020-01'), person(3, '2021-01'), person(4, '2022-01')];
  assert.throws(
    () => drawSecretSanta(people, { currentMonth: NOW }),
    (error) => error instanceof DrawError && error.message.startsWith('Persona 1 no coincidió'),
  );
});

test('detecta cuando no hay ninguna combinación posible', () => {
  // La 2 y la 3 solo coincidieron con la 1: las dos tendrían que regalarle a ella.
  const people = [person(1, '2015-01', '2020-12'), person(2, '2015-01', '2016-01'), person(3, '2020-06', '2020-12')];
  assert.throws(() => drawSecretSanta(people, { currentMonth: NOW }), DrawError);
});

test('hacen falta al menos 3 participantes', () => {
  assert.throws(
    () => drawSecretSanta([person(1, '2020-01'), person(2, '2020-01')], { currentMonth: NOW }),
    /al menos 3/,
  );
});
