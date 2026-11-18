import { createHmac, webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import gateway, { routes } from './index';

const user = '12345678-1234-1234-1234-123456789abc';
const session = '12345678-1234-1234-1234-123456789def';
const round = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const env = { SUPABASE_URL: 'https://principal.test', SUPABASE_PUBLISHABLE_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'principal-secret', SUPABASE_JWT_SECRET: 'jwt-secret', QUIZ_SUPABASE_URL: 'https://quiz.test', QUIZ_SUPABASE_SERVICE_ROLE_KEY: 'quiz-secret' };
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const unsigned = `${encode({ alg: 'HS256' })}.${encode({ sub: user, session_id: session, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}`;
const token = `${unsigned}.${createHmac('sha256', env.SUPABASE_JWT_SECRET).update(unsigned).digest('base64url')}`;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const endpoints = ['display/rounds', 'display/leaderboard', 'contacts'] as const;
const queryFor = (endpoint: string) => endpoint === 'display/rounds' ? '' : `?round_id=${round}`;
const request = (endpoint: string, query = queryFor(endpoint)) => new Request(`https://gateway.test/v1/admin/quiz/${endpoint}${query}`, { headers: { authorization: `Bearer ${token}`, 'x-user-id': 'forged' } });
const invoke = (endpoint: string, query?: string, config = env) => routes[`GET /v1/admin/quiz/${endpoint}`](request(endpoint, query), config as never);

function setup(options: { grant?: boolean; data?: unknown; status?: number } = {}) {
  vi.stubGlobal('crypto', webcrypto);
  const mock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    if (url.origin === env.SUPABASE_URL) {
      if (url.pathname.endsWith('/auth/v1/user')) return json({ id: user });
      if (url.pathname.endsWith('/user_roles')) return json([{ role: 'super_admin' }]);
      if (url.pathname.endsWith('/super_admin_accounts')) return json([{ id: 'account', ativo: true, bloqueado: false }]);
      if (url.pathname.endsWith('/is_active_quiz_super_admin_session')) return json(true);
      if (url.pathname.endsWith('/quiz_passkey_grants')) return json(options.grant === false ? [] : [{ account_id: 'account', auth_user_id: user, auth_session_id: session, expires_at: new Date(Date.now() + 60000).toISOString(), passkey_id: 'key', super_admin_passkeys: { id: 'key', account_id: 'account', revoked_at: null } }]);
    }
    if (url.origin === env.QUIZ_SUPABASE_URL) return json('data' in options ? options.data : [], options.status ?? 200);
    throw new Error(`unexpected origin ${url.origin}`);
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}
const quizCalls = (mock: ReturnType<typeof setup>) => mock.mock.calls.filter(([url]) => new URL(url).origin === env.QUIZ_SUPABASE_URL);
afterEach(() => vi.unstubAllGlobals());

describe('handlers internos de admin quiz', () => {
  it.each(endpoints)('%s exige grant antes de consultar quiz', async (endpoint) => {
    const mock = setup({ grant: false });
    const response = await invoke(endpoint);
    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(quizCalls(mock)).toHaveLength(0);
  });
  it.each(endpoints)('%s permanece bloqueado pela rota publica', async (endpoint) => {
    const mock = setup();
    const response = await gateway.fetch(request(endpoint), env);
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mock).not.toHaveBeenCalled();
  });
  it('a habilitação explícita mantém a exigência de passkey na rota pública', async () => {
    const mock = setup({ grant: false });
    const response = await gateway.fetch(request('contacts'), { ...env, QUIZ_ADMIN_ENABLED: 'true' });
    expect(response.status).toBe(403);
    expect(quizCalls(mock)).toHaveLength(0);
  });
  it('com grant válido encaminha a consulta de contatos pela rota pública', async () => {
    const mock = setup({ data: [] });
    const response = await gateway.fetch(request('contacts'), { ...env, QUIZ_ADMIN_ENABLED: 'true' });
    expect(response.status).toBe(200);
    expect(quizCalls(mock)).toHaveLength(1);
  });

  it.each([
    ['display/rounds', [{ id: round, name: 'Rodada', active: true, email: 'private', phone: 'private' }], [{ id: round, name: 'Rodada', active: true }], 'quiz_display_rounds'],
    ['display/leaderboard', [{ nickname: 'N', xp: 10, correct_count: 2, elapsed_ms: 30, email: 'private', phone: 'private' }], [{ nickname: 'N', xp: 10, correct_count: 2, elapsed_ms: 30 }], 'quiz_display_leaderboard'],
    ['contacts', [{ game_id: round, nickname: 'N', xp: 10, correct_count: 2, elapsed_ms: 30, finished_at: '2026-01-01', email: 'winner@test.invalid', phone: '123', expires_at: '2026-02-01', selected_winner: true, extra_secret: 'private' }], [{ game_id: round, nickname: 'N', xp: 10, correct_count: 2, elapsed_ms: 30, finished_at: '2026-01-01', email: 'winner@test.invalid', phone: '123', expires_at: '2026-02-01', selected_winner: true }], 'quiz_admin_contacts'],
  ])('%s usa servico isolado, projecao e paginacao', async (endpoint, data, expected, rpc) => {
    const mock = setup({ data });
    const query = `${queryFor(endpoint) || '?'}${endpoint === 'display/rounds' ? '' : '&'}limit=2&offset=10000`;
    const response = await invoke(endpoint, query);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ success: true, data: expected });
    const calls = quizCalls(mock);
    expect(calls).toHaveLength(1);
    const [url, init] = calls[0];
    expect(url).toBe(`${env.QUIZ_SUPABASE_URL}/rest/v1/rpc/${rpc}`);
    expect(init?.headers).toEqual({ apikey: 'quiz-secret', Authorization: 'Bearer quiz-secret', 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init?.body))).toEqual({ ...(endpoint === 'contacts' ? { p_actor_id: user } : {}), ...(endpoint === 'display/rounds' ? {} : { p_round_id: round }), p_limit: 2, p_offset: 10000 });
  });
  it.each(endpoints.flatMap(endpoint => [
    [endpoint, `${queryFor(endpoint) || '?'}${endpoint === 'display/rounds' ? '' : '&'}limit=${endpoint === 'contacts' ? 51 : 101}`],
    [endpoint, `${queryFor(endpoint) || '?'}${endpoint === 'display/rounds' ? '' : '&'}offset=10001`],
    [endpoint, `${queryFor(endpoint) || '?'}${endpoint === 'display/rounds' ? '' : '&'}limit=1&limit=2`],
  ]))('%s rejeita paginacao invalida %s', async (endpoint, query) => {
    const mock = setup();
    expect((await invoke(endpoint, query)).status).toBe(400);
    expect(quizCalls(mock)).toHaveLength(0);
  });
  it.each(endpoints.flatMap(endpoint => [
    [endpoint, { ...env, QUIZ_SUPABASE_URL: env.SUPABASE_URL }],
    [endpoint, { ...env, QUIZ_SUPABASE_URL: 'http://quiz.test' }],
    [endpoint, { ...env, QUIZ_SUPABASE_SERVICE_ROLE_KEY: '' }],
  ]))('%s rejeita configuracao nao isolada', async (endpoint, config) => {
    const mock = setup();
    expect((await invoke(endpoint, undefined, config)).status).toBe(503);
    expect(quizCalls(mock)).toHaveLength(0);
  });
  it.each(['display/rounds', 'display/leaderboard'])('%s rejeita dados malformados', async (endpoint) => {
    setup({ data: [{ email: 'private' }] });
    expect((await invoke(endpoint)).status).toBe(503);
  });
  it.each(['display/rounds', 'display/leaderboard'])('%s rejeita resposta acima do limite', async (endpoint) => {
    const row = endpoint === 'display/rounds' ? { id: round, name: 'R', active: true } : { nickname: 'N', xp: 1, correct_count: 1, elapsed_ms: 1 };
    setup({ data: [row, row] });
    const query = `${queryFor(endpoint) || '?'}${endpoint === 'display/rounds' ? '' : '&'}limit=1`;
    expect((await invoke(endpoint, query)).status).toBe(503);
  });
  it.each(['display/leaderboard', 'contacts'])('%s rejeita rodada invalida ou repetida', async (endpoint) => {
    const mock = setup();
    expect((await invoke(endpoint, '?round_id=invalid')).status).toBe(400);
    expect((await invoke(endpoint, `?round_id=${round}&round_id=${round}`)).status).toBe(400);
    expect(quizCalls(mock)).toHaveLength(0);
  });
  it.each([
    { email: 'private' },
    null,
    'private',
    [{ email: 'private' }],
    Array.from({ length: 2 }, () => ({ game_id: round, nickname: 'N', xp: 1, correct_count: 1, elapsed_ms: 1, finished_at: null, email: null, phone: null, expires_at: null })),
  ])('contatos rejeita resposta malformada ou acima do limite', async (data) => {
    setup({ data });
    const response = await invoke('contacts', `?round_id=${round}&limit=1`);
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ success: false, error: 'Servico indisponivel.' });
  });
  it.each(endpoints)('%s nao revela erros do servico', async (endpoint) => {
    setup({ data: { secret: 'private' }, status: 500 });
    const response = await invoke(endpoint);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ success: false, error: 'Servico indisponivel.' });
  });
});
