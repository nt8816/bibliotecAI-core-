import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const livro = { titulo: 'O Coração', editora: 'Árvore', ano: 2020, autor: 'José Silva' };
const obra = { key: '/works/OL123W', title: 'O Coracao', author_name: ['Jose Silva'] };
const edicao = { title: 'O Coração', publishers: ['Arvore'], publish_date: '12 May 2020', covers: [123] };
const ok = (data) => ({ ok: true, status: 200, json: async () => data });
let buscarCapaLivro;

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  ({ buscarCapaLivro } = await import('../services/capasOpenLibraryService'));
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('busca de capas Open Library', () => {
  it('normaliza acentos e exige título, editora e ano da mesma edição', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(ok({ docs: [obra] })).mockResolvedValueOnce(ok({ entries: [
      { ...edicao, publish_date: '2019' }, { ...edicao, publishers: ['Outra'] }, edicao,
    ] }));
    vi.stubGlobal('fetch', fetch);
    expect(await buscarCapaLivro(livro)).toBe('https://covers.openlibrary.org/b/id/123-M.jpg');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(['Árvore / São Paulo / 6ª Ed.', 'São Paulo/Árvore'])('reconhece editora separada por barra: %s', async (editora) => {
    const fetch = vi.fn().mockResolvedValueOnce(ok({ docs: [obra] })).mockResolvedValueOnce(ok({ entries: [edicao] }));
    vi.stubGlobal('fetch', fetch);
    expect(await buscarCapaLivro({ ...livro, editora })).toBe('https://covers.openlibrary.org/b/id/123-M.jpg');
  });

  it('não aceita correspondência parcial de nomes de editoras', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(ok({ docs: [obra] })).mockResolvedValueOnce(ok({ entries: [{ ...edicao, publishers: ['Árvore Nova'] }] }));
    vi.stubGlobal('fetch', fetch);
    expect(await buscarCapaLivro({ ...livro, editora: 'Árvore / São Paulo' })).toBeNull();
  });

  it('rejeita homônimos, edições incompatíveis e identificadores inseguros', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(ok({ docs: [
      { ...obra, author_name: ['Outro'] }, { ...obra, key: '/works/../../unsafe' }, obra,
    ] })).mockResolvedValueOnce(ok({ entries: [
      { ...edicao, title: 'Outro título' }, { ...edicao, publish_date: '2019' },
      { ...edicao, publishers: ['Outra'] }, { ...edicao, covers: ['123/../../x'] },
    ] }));
    vi.stubGlobal('fetch', fetch);
    expect(await buscarCapaLivro(livro)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('não consulta com dados faltantes e persiste resultados negativos', async () => {
    const fetch = vi.fn().mockResolvedValue(ok({ docs: [] }));
    vi.stubGlobal('fetch', fetch);
    expect(await buscarCapaLivro({ titulo: 'Livro' })).toBeNull();
    expect(await buscarCapaLivro(livro)).toBeNull();
    vi.resetModules();
    ({ buscarCapaLivro } = await import('../services/capasOpenLibraryService'));
    expect(await buscarCapaLivro(livro)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('expira o cache e reutiliza uma resposta positiva', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValueOnce(ok({ docs: [obra] })).mockResolvedValueOnce(ok({ entries: [edicao] })).mockResolvedValue(ok({ docs: [] }));
    vi.stubGlobal('fetch', fetch);
    await buscarCapaLivro(livro);
    expect(await buscarCapaLivro(livro)).toContain('/123-M.jpg');
    expect(fetch).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);
    expect(await buscarCapaLivro(livro)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it.each(['404', 'network'])('retorna null com erro %s', async (tipo) => {
    vi.stubGlobal('fetch', tipo === 'network' ? vi.fn().mockRejectedValue(new Error('offline')) : vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await buscarCapaLivro(livro)).toBeNull();
  });

  it('respeita 429 para buscas distintas', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 429, headers: { get: () => '600' } });
    vi.stubGlobal('fetch', fetch);
    expect(await buscarCapaLivro(livro)).toBeNull();
    expect(await buscarCapaLivro({ ...livro, titulo: 'Outro' })).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('deduplica buscas simultâneas e limita a concorrência', async () => {
    let active = 0;
    let max = 0;
    const resolvers = [];
    const fetch = vi.fn(() => new Promise((resolve) => {
      active++;
      max = Math.max(max, active);
      resolvers.push(() => { active--; resolve(ok({ docs: [] })); });
    }));
    vi.stubGlobal('fetch', fetch);
    const requests = Array.from({ length: 7 }, (_, i) => buscarCapaLivro({ ...livro, titulo: 'Livro ' + i }));
    requests.push(buscarCapaLivro({ ...livro, titulo: 'Livro 0' }));
    expect(fetch).toHaveBeenCalledTimes(3);
    while (fetch.mock.calls.length < 7 || resolvers.length) {
      resolvers.splice(0).forEach((resolve) => resolve());
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(await Promise.all(requests)).toEqual(Array(8).fill(null));
    expect(fetch).toHaveBeenCalledTimes(7);
    expect(max).toBe(3);
  });
});
