import { randomInt } from 'node:crypto';

export class DrawError extends Error {
  constructor(message, details) {
    super(message);
    this.details = details;
  }
}

export function periodsOverlap(a, b, currentMonth) {
  const aEnd = a.endMonth ?? currentMonth;
  const bEnd = b.endMonth ?? currentMonth;
  return a.startMonth <= bEnd && b.startMonth <= aEnd;
}

export function overlapCounts(people, currentMonth) {
  return new Map(
    people.map((person) => [
      person.id,
      people.filter((other) => other.id !== person.id && periodsOverlap(person, other, currentMonth)).length,
    ]),
  );
}

/**
 * Devuelve una pareja { giverId, receiverId } por participante: todos regalan y reciben
 * exactamente una vez, nadie se regala a sí mismo y solo se regala a alguien con quien
 * se ha coincidido trabajando. Si es posible, evita parejas que se regalan mutuamente.
 */
export function drawSecretSanta(people, { currentMonth, randomIndex = randomInt, attempts = 200 }) {
  if (people.length < 3) throw new DrawError('Hacen falta al menos 3 participantes para hacer el sorteo.');

  const compatible = people.map((person, index) =>
    people.flatMap((other, otherIndex) =>
      otherIndex !== index && periodsOverlap(person, other, currentMonth) ? [otherIndex] : [],
    ),
  );

  const isolated = people.filter((_, index) => compatible[index].length === 0);
  if (isolated.length > 0) {
    const verb = isolated.length === 1 ? 'coincidió' : 'coincidieron';
    throw new DrawError(
      `${listNames(isolated)} no ${verb} en Khambu con ningún otro participante. Revisad sus fechas.`,
      { people: isolated.map((person) => person.name) },
    );
  }

  let best = null;
  let bestMutualPairs = Infinity;
  for (let attempt = 0; attempt < attempts && bestMutualPairs > 0; attempt += 1) {
    const receiverOf = randomPerfectMatching(compatible, randomIndex);
    if (!receiverOf) {
      throw new DrawError(
        'Con las fechas actuales no hay forma de que a todo el mundo le toque alguien con quien coincidió. Revisad las fechas de quienes coincidieron con menos gente.',
      );
    }

    const mutualPairs = countMutualPairs(receiverOf);
    if (mutualPairs < bestMutualPairs) {
      best = receiverOf;
      bestMutualPairs = mutualPairs;
    }
  }

  return best.map((receiverIndex, giverIndex) => ({
    giverId: people[giverIndex].id,
    receiverId: people[receiverIndex].id,
  }));
}

// Emparejamiento bipartito (algoritmo de Kuhn) con el orden barajado para que cada sorteo
// sea distinto. Si no consigue emparejar a todos, no existe ninguna combinación válida.
function randomPerfectMatching(compatible, randomIndex) {
  const options = compatible.map((receivers) => shuffle(receivers, randomIndex));
  const giverOf = new Array(compatible.length).fill(-1);

  const assign = (giver, visited) => {
    for (const receiver of options[giver]) {
      if (visited[receiver]) continue;
      visited[receiver] = true;
      if (giverOf[receiver] === -1 || assign(giverOf[receiver], visited)) {
        giverOf[receiver] = giver;
        return true;
      }
    }
    return false;
  };

  for (const giver of shuffle([...compatible.keys()], randomIndex)) {
    if (!assign(giver, new Array(compatible.length).fill(false))) return null;
  }

  const receiverOf = new Array(compatible.length);
  giverOf.forEach((giver, receiver) => {
    receiverOf[giver] = receiver;
  });
  return receiverOf;
}

function countMutualPairs(receiverOf) {
  return receiverOf.filter((receiver, giver) => receiverOf[receiver] === giver).length / 2;
}

function shuffle(items, randomIndex) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = randomIndex(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function listNames(people) {
  const names = people.map((person) => person.name);
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`;
}
