import { afterEach, describe, expect, it, vi } from 'vitest';
import gateway from './index';

const env = { SUPABASE_URL: 'https://supabase.test', SUPABASE_PUBLISHABLE_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' };
const profile = { id: 'profile-1', escola_id: 'school-1', tipo: 'aluno' };
const book = { id: 'book-1', titulo: 'Livro', autor: 'Autora', area: 'Fantasia', sinopse: '', disponivel: true };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const request = (path: string, method = 'GET', body?: unknown) => new Request('https://gateway.test' + path, { method, headers: { authorization: 'Bearer token', 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

afterEach(() => vi.unstubAllGlobals());

describe('recomendações no gateway', () => {
  it('rejeita acesso sem autenticação', async () => {
    const response = await gateway.fetch(new Request('https://gateway.test/v1/livros/recomendacao'), env);
    expect(response.status).toBe(401);
  });

  it('valida gêneros antes de gravar', async () => {
    const fetchMock = vi.fn(async (url: string) => json(url.includes('/auth/') ? { id: 'auth-1' } : [profile]));
    vi.stubGlobal('fetch', fetchMock);
    const response = await gateway.fetch(request('/v1/livros/preferencias', 'POST', { generos: ['Fantasia', 'Fantasia'] }), env);
    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('solicita preferências sem chamar IA nem registrar sugestão no cold start', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/auth/')) return json({ id: 'auth-1' });
      if (url.includes('/usuarios_biblioteca?')) return json([profile]);
      if (url.includes('/livros?')) return json([book]);
      return json([]);
    });
    vi.stubGlobal('fetch', fetchMock);
    const response = await gateway.fetch(request('/v1/livros/recomendacao'), env);
    expect(await response.json()).toMatchObject({ principal: null, precisa_preferencias: true, restantes_hoje: 3 });
    expect(fetchMock.mock.calls.some(([url]) => url.includes('workers.dev') || url.includes('/rpc/'))).toBe(false);
  });

  it('para equipe sem histórico prioriza popularidade e não pede preferências', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url.includes('/auth/')) return json({ id: 'auth-1' });
      if (url.includes('/usuarios_biblioteca?')) return json([{ ...profile, tipo: 'gestor' }]);
      if (url.includes('/livros?')) return json([book, { ...book, id: 'book-2', titulo: 'Outro' }]);
      if (url.includes('/emprestimos?')) return json(new URL(url).searchParams.has('usuarios_biblioteca.escola_id') ? [{ livro_id: 'book-2' }] : []);
      if (url.includes('workers.dev/text')) return json({}, 503);
      if (url.includes('/rpc/')) {
        const body = JSON.parse(String(init.body));
        return json({ estado: 'ok', contador: 0, principal: body.p_candidatos[0] });
      }
      return json([]);
    }));
    const response = await gateway.fetch(request('/v1/livros/recomendacao'), env);
    expect(await response.json()).toMatchObject({ precisa_preferencias: false, principal: { livro_id: 'book-2', origem: 'local' } });
  });

  it('usa fallback local, restringe consultas e respeita limite retornado pelo RPC', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      if (url.includes('/auth/')) return json({ id: 'auth-1' });
      if (url.includes('usuarios_biblioteca?')) return json([profile]);
      if (url.includes('/livros?')) return json(new URL(url).searchParams.get('escola_id') === 'is.null' ? [] : [book]);
      if (url.includes('/emprestimos?')) return json([]);
      if (url.includes('/aluno_livro_preferencias?')) return json([{ generos: ['Fantasia'] }]);
      if (url.includes('/aluno_livro_sugestoes_dia?')) return json([]);
      if (url.includes('workers.dev/text')) return json({ error: 'offline' }, 503);
      if (url.includes('/rpc/registrar_recomendacao_livro')) {
        const body = JSON.parse(String(init.body));
        return json(body.p_proximo ? { estado: 'limite', contador: 3 } : { estado: 'ok', contador: 0, principal: body.p_candidatos[0] });
      }
      throw new Error(url);
    }));
    const response = await gateway.fetch(request('/v1/livros/recomendacao'), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ principal: { livro_id: 'book-1', origem: 'local' }, restantes_hoje: 3, precisa_preferencias: false });
    const books = new URL(calls.find(call => call.url.includes('/livros?'))!.url);
    expect(books.searchParams.get('escola_id')).toBe('eq.school-1');
    const personalLoans = calls.find(call => call.url.includes('/emprestimos?') && new URL(call.url).searchParams.has('usuario_id'))!;
    expect(new URL(personalLoans.url).searchParams.get('usuario_id')).toBe('eq.profile-1');
    const next = await gateway.fetch(request('/v1/livros/recomendacao/proximo', 'POST', {}), env);
    expect(next.status).toBe(429);
    expect(await next.json()).toMatchObject({ restantes_hoje: 0 });
  });
});
