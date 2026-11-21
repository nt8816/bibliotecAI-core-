import { createHmac, webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import gateway, { hasQuizAdminAccess } from './index';

const env = {
  SUPABASE_URL: 'https://principal.test', SUPABASE_PUBLISHABLE_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_JWT_SECRET: 'test-secret',
  QUIZ_SUPABASE_URL: 'https://quiz.test', QUIZ_SUPABASE_SERVICE_ROLE_KEY: 'quiz-secret',
};
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const tokenFor = (aal: string, secret = env.SUPABASE_JWT_SECRET) => {
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ iat: 1700000000, aal })}`;
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
};

afterEach(() => vi.unstubAllGlobals());

describe('contrato publico do quiz administrativo bloqueado', () => {
  it.each([
    { name: 'sessao sem token', path: '/v1/admin/quiz/session?user_id=forged', token: '' },
    { name: 'sessao com token invalido', path: '/v1/admin/quiz/session', token: 'invalid' },
    { name: 'sessao com assinatura incorreta', path: '/v1/admin/quiz/session', token: tokenFor('aal2', 'different-secret') },
    { name: 'sessao sem aal2', path: '/v1/admin/quiz/session', token: tokenFor('aal1') },
    { name: 'sessao com aal2', path: '/v1/admin/quiz/session?user_id=forged', token: tokenFor('aal2') },
    { name: 'contatos sem aal2', path: '/v1/admin/quiz/contacts?round_id=12345678-1234-1234-1234-123456789abc', token: tokenFor('aal1') },
    { name: 'contatos com aal2', path: '/v1/admin/quiz/contacts?round_id=12345678-1234-1234-1234-123456789abc', token: tokenFor('aal2') },
    ...['limit=51', 'offset=10001', 'limit=1&limit=2'].map((query) => ({
      name: `contatos com paginacao ${query}`,
      path: `/v1/admin/quiz/contacts?round_id=12345678-1234-1234-1234-123456789abc&${query}`,
      token: tokenFor('aal2'),
    })),
  ])('$name retorna 503 sem chamadas externas', async ({ path, token }) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const headers = token ? { authorization: `Bearer ${token}`, 'x-user-id': 'forged' } : {};
    const response = await gateway.fetch(new Request(`https://gateway.test${path}`, { headers }), env);
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ success: false, error: 'Autenticacao reforcada indisponivel.' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('grant de quiz vinculado a sessao', () => {
  const user = '12345678-1234-1234-1234-123456789abc';
  const session = '12345678-1234-1234-1234-123456789def';
  const account = 'account';
  const makeToken = (claims: Record<string, unknown> = {}) => {
    const unsigned = `${encode({ alg: 'HS256' })}.${encode({ sub: user, session_id: session, role: 'authenticated', aal: 'aal2', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300, ...claims })}`;
    return `${unsigned}.${createHmac('sha256', env.SUPABASE_JWT_SECRET).update(unsigned).digest('base64url')}`;
  };
  const request = (token = makeToken()) => new Request('https://gateway.test/v1/admin/quiz/session', { headers: { authorization: `Bearer ${token}` } });
  const grant = () => ({ account_id: account, auth_user_id: user, auth_session_id: session, expires_at: new Date(Date.now() + 60000).toISOString(), passkey_id: 'key', super_admin_passkeys: { id: 'key', account_id: account, revoked_at: null } });
  const setup = (rows: unknown = [grant()], active: unknown = true, options: { auth?: unknown; role?: boolean; account?: unknown } = {}) => {
    vi.stubGlobal('crypto', webcrypto);
    const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
    const mock = vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = new URL(input);
      if (url.pathname.endsWith('/auth/v1/user')) return json(options.auth === undefined ? { id: user } : options.auth);
      if (url.pathname.endsWith('/user_roles')) return json(options.role === false ? [] : [{ role: 'super_admin' }]);
      if (url.pathname.endsWith('/super_admin_accounts')) {
        expect(url.searchParams.get('auth_user_id')).toBe(`eq.${user}`);
        return json(options.account === undefined ? [{ id: account, ativo: true, bloqueado: false, ultimo_mfa_em: null }] : options.account);
      }
      if (url.pathname.endsWith('/is_active_quiz_super_admin_session')) {
        expect(JSON.parse(String(init.body))).toEqual({ p_account_id: account, p_auth_user_id: user, p_auth_session_id: session });
        return json(active);
      }
      if (url.pathname.endsWith('/quiz_passkey_grants')) {
        expect(url.searchParams.get('auth_session_id')).toBe(`eq.${session}`);
        expect(url.searchParams.get('super_admin_passkeys.revoked_at')).toBe('is.null');
        return json(rows);
      }
      throw new Error('unexpected request');
    });
    vi.stubGlobal('fetch', mock);
    return mock;
  };
  it('nega os endpoints removidos de passkey', async () => {
    for (const action of ['options', 'verify']) {
      const response = await gateway.fetch(new Request(`https://gateway.test/v1/admin/quiz/passkeys/${action}`, { method: 'POST' }), env as never);
      expect(response.status).toBe(404);
    }
  });
  it.each([undefined, 'aal1', 'aal2'])('aceita sessão ativa sem depender de aal=%s ou timestamp global', async (aal) => {
    setup();
    expect(await hasQuizAdminAccess(request(makeToken({ aal })), env as never, { id: user })).toBe(true);
  });
  it.each([
    { auth: null }, { auth: { id: 'other' } }, { role: false }, { account: [] },
    { account: [{ id: account, ativo: false, bloqueado: false }] },
    { account: [{ id: account, ativo: true, bloqueado: true }] },
  ])('nega identidade, papel ou conta invalida: %j', async (options) => {
    setup([grant()], true, options);
    expect(await hasQuizAdminAccess(request(), env as never, { id: user })).toBe(false);
  });
  it.each([
    { exp: Math.floor(Date.now() / 1000) - 1 }, { role: 'service_role' },
    { session_id: 'invalid' }, { session_id: undefined }, { sub: 'other' },
  ])('nega claims invalidos: %j', async (claims) => {
    setup();
    expect(await hasQuizAdminAccess(request(makeToken(claims)), env as never, { id: user })).toBe(false);
  });
  it('nega assinatura invalida e falha do Auth', async () => {
    setup();
    const token = makeToken();
    const [header, payload] = token.split('.');
    const forged = `${header}.${payload}.${createHmac('sha256', 'wrong').update(`${header}.${payload}`).digest('base64url')}`;
    expect(await hasQuizAdminAccess(request(forged), env as never, { id: user })).toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unavailable')));
    expect(await hasQuizAdminAccess(request(), env as never, { id: user })).toBe(false);
  });
  it('rejeita sessao revogada e JWT de outro usuario', async () => {
    setup([grant()], false);
    expect(await hasQuizAdminAccess(request(), env as never, { id: user })).toBe(false);
    expect(await hasQuizAdminAccess(request(makeToken({ sub: 'other' })), env as never, { id: user })).toBe(false);
  });
});

// Estes contratos anteriores precisam de revisao apos implementar step-up seguro vinculado a sessao.
describe.skip('cenarios funcionais anteriores ao bloqueio', () => {
  const issuedAt = 1700000000;
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ iat: issuedAt, aal: 'aal2' })}`;
  const token = `${unsigned}.${createHmac('sha256', env.SUPABASE_JWT_SECRET).update(unsigned).digest('base64url')}`;
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
  const request = (bearer?: string) => new Request('https://gateway.test/v1/admin/quiz/session?user_id=forged', { headers: bearer ? { authorization: `Bearer ${bearer}`, 'x-user-id': 'forged' } : {} });
  const contactRequest = (query = 'round_id=12345678-1234-1234-1234-123456789abc', bearer = token) => new Request(`https://gateway.test/v1/admin/quiz/contacts?${query}`, { headers: { authorization: `Bearer ${bearer}` } });

  it.each([false, true])('exige papel e MFA antes de acessar quiz (MFA=%s)', async (role) => {
    vi.stubGlobal('crypto', webcrypto);
    const fetchMock = vi.fn(async (url: string) => {
      expect(new URL(url).origin).toBe(env.SUPABASE_URL);
      if (url.includes('/auth/v1/user')) return json({ id: 'verified-user' });
      if (url.includes('/user_roles?')) return json(role ? [{ role: 'super_admin' }] : []);
      if (url.includes('/super_admin_accounts?')) return json([{ id: 'account', ativo: true, ultimo_mfa_em: new Date((issuedAt - 10) * 1000).toISOString() }]);
      throw new Error('unexpected');
    });
    vi.stubGlobal('fetch', fetchMock);
    const response = await gateway.fetch(contactRequest(), env);
    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it.each(['limit=51', 'offset=10001', 'limit=1&limit=2'])('rejeita paginacao invalida %s', async (query) => {
    vi.stubGlobal('crypto', webcrypto);
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/auth/v1/user')) return json({ id: 'verified-user' });
      if (url.includes('/user_roles?')) return json([{ role: 'super_admin' }]);
      if (url.includes('/super_admin_accounts?')) return json([{ id: 'account', ativo: true, ultimo_mfa_em: new Date((issuedAt + 1) * 1000).toISOString() }]);
      throw new Error('quiz nao deve ser acessado');
    });
    vi.stubGlobal('fetch', fetchMock);
    const response = await gateway.fetch(contactRequest(`round_id=12345678-1234-1234-1234-123456789abc&${query}`), env);
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('usa somente credencial do quiz e identidade verificada', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/auth/v1/user')) return json({ id: '12345678-1234-1234-1234-123456789def' });
      if (url.includes('/user_roles?')) return json([{ role: 'super_admin' }]);
      if (url.includes('/super_admin_accounts?')) return json([{ id: 'account', ativo: true, ultimo_mfa_em: new Date((issuedAt + 1) * 1000).toISOString() }]);
      expect(url).toBe('https://quiz.test/rest/v1/rpc/quiz_admin_contacts');
      expect((init?.headers as Record<string, string>).apikey).toBe('quiz-secret');
      expect(JSON.parse(String(init?.body))).toEqual({ p_actor_id: '12345678-1234-1234-1234-123456789def', p_round_id: '12345678-1234-1234-1234-123456789abc', p_limit: 20, p_offset: 0 });
      return json([{ email: 'winner@test.invalid', phone: null }]);
    });
    vi.stubGlobal('fetch', fetchMock);
    const response = await gateway.fetch(contactRequest(), env);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ success: true, data: [{ email: 'winner@test.invalid', phone: null }] });
  });

  it.each(['/v1/admin/quiz/session', '/v1/admin/quiz/contacts?round_id=12345678-1234-1234-1234-123456789abc'])('nega token sem aal2 em %s', async (path) => {
    vi.stubGlobal('crypto', webcrypto);
    const noMfaUnsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ iat: issuedAt, aal: 'aal1' })}`;
    const noMfaToken = `${noMfaUnsigned}.${createHmac('sha256', env.SUPABASE_JWT_SECRET).update(noMfaUnsigned).digest('base64url')}`;
    const fetchMock = vi.fn(async (url: string) => {
      expect(new URL(url).origin).toBe(env.SUPABASE_URL);
      if (url.includes('/auth/v1/user')) return json({ id: 'verified-user' });
      if (url.includes('/user_roles?')) return json([{ role: 'super_admin' }]);
      if (url.includes('/super_admin_accounts?')) return json([{ id: 'account', ativo: true, ultimo_mfa_em: new Date((issuedAt + 1) * 1000).toISOString() }]);
      throw new Error('unexpected');
    });
    vi.stubGlobal('fetch', fetchMock);
    const response = await gateway.fetch(new Request(`https://gateway.test${path}`, { headers: { authorization: `Bearer ${noMfaToken}` } }), env);
    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('nega token nao verificavel pelo segredo HMAC existente', async () => {
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/auth/v1/user')) return json({ id: 'verified-user' });
      if (url.includes('/user_roles?')) return json([{ role: 'super_admin' }]);
      throw new Error('unexpected');
    }));
    const response = await gateway.fetch(request(`${unsigned}.${createHmac('sha256', 'different-secret').update(unsigned).digest('base64url')}`), env);
    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('nega ausencia de token sem chamadas externas', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await gateway.fetch(request(), env);
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'token invalido', auth: false, role: false, mfa: true, status: 401 },
    { name: 'sem papel super admin', auth: true, role: false, mfa: true, status: 403 },
    { name: 'sem MFA posterior a emissao', auth: true, role: true, mfa: false, status: 403 },
    { name: 'super admin com MFA', auth: true, role: true, mfa: true, status: 200 },
  ])('$name', async ({ auth, role, mfa, status }) => {
    vi.stubGlobal('crypto', webcrypto);
    const fetchMock = vi.fn(async (url: string) => {
      expect(new URL(url).origin).toBe(env.SUPABASE_URL);
      if (url.includes('/auth/v1/user')) return auth ? json({ id: 'verified-user', email: 'admin@test.invalid' }) : json({}, 401);
      if (url.includes('/user_roles?')) return json(role ? [{ role: 'super_admin' }] : []);
      if (url.includes('/super_admin_accounts?')) return json([{ id: 'account', ativo: true, bloqueado: false, ultimo_mfa_em: new Date((issuedAt + (mfa ? 1 : -10)) * 1000).toISOString() }]);
      throw new Error(`Unexpected call: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const response = await gateway.fetch(request(token), env);
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('no-store');
    if (status === 200) expect(await response.json()).toEqual({ success: true, user: { id: 'verified-user' } });
  });
});
