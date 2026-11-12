const CACHE_PREFIX = 'open-library-capa:v2:';
const TTL = 24 * 60 * 60 * 1000;
const ERROR_TTL = 5 * 60 * 1000;
const MAX_CONCURRENT = 3;
const cache = new Map();
const pending = new Map();
const queue = [];
let active = 0;
let blockedUntil = 0;

const normalizar = (value) => typeof value === 'string'
  ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  : '';

function editorasCompativeis(cadastrada, publicada) {
  const segmentos = (value) => String(value || '').split('/').map(normalizar).filter(Boolean);
  const nomes = segmentos(cadastrada);
  return segmentos(publicada).some((nome) => nomes.includes(nome));
}

function limitar(fn) {
  return new Promise((resolve) => {
    queue.push(async () => {
      try { resolve(await fn()); } catch { resolve(null); } finally {
        active--;
        executarFila();
      }
    });
    executarFila();
  });
}

function executarFila() {
  while (active < MAX_CONCURRENT && queue.length) {
    active++;
    queue.shift()();
  }
}

async function consultar(url) {
  if (Date.now() < blockedUntil) throw new Error('rate limited');
  const response = await fetch(url);
  if (response.status === 429) {
    const retry = response.headers?.get('Retry-After');
    const seconds = Number(retry);
    const delay = retry && Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retry) - Date.now();
    blockedUntil = Date.now() + Math.max(ERROR_TTL, Number.isFinite(delay) ? delay : 0);
  }
  if (!response.ok) throw new Error('Open Library unavailable');
  return response.json();
}

function lerCache(key) {
  let entry = cache.get(key);
  if (!entry) {
    try { entry = JSON.parse(localStorage.getItem(CACHE_PREFIX + key)); } catch { /* storage is optional */ }
  }
  if (entry && entry.expires > Date.now() && (entry.url === null || /^https:\/\/covers\.openlibrary\.org\/b\/id\/[1-9][0-9]*-M\.jpg$/.test(entry.url))) return entry;
  cache.delete(key);
  return null;
}

function salvarCache(key, url, ttl) {
  const entry = { url, expires: Date.now() + ttl };
  cache.set(key, entry);
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry)); } catch { /* storage is optional */ }
}

async function buscar(titulo, editora, ano, autor) {
  const params = new URLSearchParams({ title: titulo, limit: '10', fields: 'key,title,author_name' });
  const result = await consultar(`https://openlibrary.org/search.json?${params}`);
  for (const obra of (Array.isArray(result.docs) ? result.docs : []).slice(0, 10)) {
    if (normalizar(obra.title) !== titulo || !/^\/works\/OL[1-9][0-9]*W$/.test(obra.key)) continue;
    if (autor && (!Array.isArray(obra.author_name) || !obra.author_name.some((name) => normalizar(name) === autor))) continue;
    const editions = await consultar(`https://openlibrary.org${obra.key}/editions.json?limit=50`);
    for (const edition of (Array.isArray(editions.entries) ? editions.entries : []).slice(0, 50)) {
      if (normalizar(edition.title) !== titulo || !Array.isArray(edition.publishers) || !edition.publishers.some((name) => editorasCompativeis(editora, name))) continue;
      const years = typeof edition.publish_date === 'string' ? edition.publish_date.match(/\b[0-9]{4}\b/g) : null;
      if (!years || years.length !== 1 || years[0] !== ano) continue;
      const cover = Array.isArray(edition.covers) && edition.covers.find((id) => Number.isSafeInteger(id) && id > 0);
      if (cover) return `https://covers.openlibrary.org/b/id/${cover}-M.jpg`;
    }
  }
  return null;
}

export async function buscarCapaLivro(livro) {
  const titulo = normalizar(livro?.titulo);
  const editora = typeof livro?.editora === 'string' ? livro.editora.trim() : '';
  const ano = String(livro?.ano ?? '').trim();
  const autor = normalizar(livro?.autor);
  if (!titulo || !normalizar(editora) || !/^[0-9]{4}$/.test(ano)) return null;
  const key = JSON.stringify([titulo, editora.split('/').map(normalizar).join('/'), ano, autor]);
  const cached = lerCache(key);
  if (cached) return cached.url;
  if (pending.has(key)) return pending.get(key);
  const promise = limitar(async () => {
    try {
      const url = await buscar(titulo, editora, ano, autor);
      salvarCache(key, url, TTL);
      return url;
    } catch {
      salvarCache(key, null, ERROR_TTL);
      return null;
    }
  });
  pending.set(key, promise);
  try { return await promise; } finally { pending.delete(key); }
}
