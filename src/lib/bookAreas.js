export const DEFAULT_BOOK_AREAS = [
  'Literatura',
  'Ciências',
  'Matemática',
  'História',
  'Geografia',
  'Infantil',
  'Artes',
  'Filosofia',
  'Sociologia',
  'Física',
  'Química',
  'Biologia',
  'Programação',
  'Informática',
  'Quadrinhos',
];

const AREA_ALIASES = {
  ciencias: 'Ciências',
  ciencia: 'Ciências',
  matematica: 'Matemática',
  matematcica: 'Matemática',
  matamatica: 'Matemática',
  historia: 'História',
  geografia: 'Geografia',
  literatura: 'Literatura',
  infantil: 'Infantil',
  arte: 'Artes',
  artes: 'Artes',
  filosofia: 'Filosofia',
  sociologia: 'Sociologia',
  fisica: 'Física',
  quimica: 'Química',
  biologia: 'Biologia',
  programacao: 'Programação',
  programaçao: 'Programação',
  informatica: 'Informática',
  quadrinhos: 'Quadrinhos',
  quadrinho: 'Quadrinhos',
  hq: 'Quadrinhos',
  gibi: 'Quadrinhos',
  manga: 'Quadrinhos',
};

export function normalizeAreaKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toTitleCase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b\p{L}/gu, (match) => match.toUpperCase())
    .trim();
}

function levenshtein(a, b) {
  const source = String(a || '');
  const target = String(b || '');
  const matrix = Array.from({ length: target.length + 1 }, (_, row) =>
    Array.from({ length: source.length + 1 }, (_, col) => (row === 0 ? col : col === 0 ? row : 0)),
  );

  for (let row = 1; row <= target.length; row += 1) {
    for (let col = 1; col <= source.length; col += 1) {
      const cost = source[col - 1] === target[row - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost,
      );
    }
  }

  return matrix[target.length][source.length];
}

export function canonicalizeBookArea(area, candidateAreas = []) {
  const raw = String(area || '').trim().replace(/\s+/g, ' ');
  if (!raw) return '';

  const key = normalizeAreaKey(raw);
  if (!key) return '';

  if (AREA_ALIASES[key]) return AREA_ALIASES[key];

  const candidates = Array.from(
    new Map(
      [...DEFAULT_BOOK_AREAS, ...candidateAreas]
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .map((item) => [normalizeAreaKey(item), item]),
    ).values(),
  );

  const exact = candidates.find((item) => normalizeAreaKey(item) === key);
  if (exact) return exact;

  let bestCandidate = '';
  let bestDistance = Number.POSITIVE_INFINITY;

  candidates.forEach((item) => {
    const candidateKey = normalizeAreaKey(item);
    if (!candidateKey) return;

    if (candidateKey.includes(key) || key.includes(candidateKey)) {
      const distance = Math.abs(candidateKey.length - key.length);
      if (distance < bestDistance) {
        bestCandidate = item;
        bestDistance = distance;
      }
      return;
    }

    const distance = levenshtein(candidateKey, key);
    if (distance < bestDistance) {
      bestCandidate = item;
      bestDistance = distance;
    }
  });

  if (bestCandidate) {
    const bestKey = normalizeAreaKey(bestCandidate);
    const maxLength = Math.max(bestKey.length, key.length, 1);
    const similarity = 1 - (bestDistance / maxLength);
    if (bestDistance <= 2 || similarity >= 0.8) return bestCandidate;
  }

  return toTitleCase(raw);
}
