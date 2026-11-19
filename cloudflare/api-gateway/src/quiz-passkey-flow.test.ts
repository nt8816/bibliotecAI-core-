import { createHmac, webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import gateway from './index';
import * as security from './superAdminSecurity';

const user = '12345678-1234-1234-1234-123456789abc';
const session = '12345678-1234-1234-1234-123456789def';
const challengeId = '12345678-1234-1234-1234-123456789aaa';
const env = { SUPABASE_URL: 'https://principal.test', SUPABASE_PUBLISHABLE_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_JWT_SECRET: 'secret', QUIZ_PASSKEY_ORIGIN: 'https://app.test', QUIZ_PASSKEY_RP_ID: 'app.test' };
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
function token(sub = user, sid = session) {
  const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const input = `${encode({ alg: 'HS256' })}.${encode({ sub, session_id: sid, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 300 })}`;
  return `${input}.${createHmac('sha256', 'secret').update(input).digest('base64url')}`;
}
function call(path: string, body: object = {}, bearer = token(), origin = env.QUIZ_PASSKEY_ORIGIN) {
  return gateway.fetch(new Request(`https://gateway.test/v1/admin/quiz/passkeys/${path}`, { method: 'POST', headers: { authorization: `Bearer ${bearer}`, origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }), env as never);
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('quiz passkey gateway', () => {
  it.each([null, [], {}, { id: '' }, { id: 'invalid' }, { id: 123 }])('fails closed for invalid issuance response %j', async (issued) => {
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      const path = new URL(input).pathname;
      if (path === '/auth/v1/user') return json({ id: user });
      if (path.endsWith('/user_roles')) return json([{ role: 'super_admin' }]);
      if (path.endsWith('/super_admin_accounts')) return json([{ id: 'account', ativo: true, bloqueado: false }]);
      if (path.endsWith('/is_active_quiz_super_admin_session')) return json(true);
      if (path.endsWith('/super_admin_passkeys')) return json([{ id: 'key', credential_id: 'credential', metadata: { rp_id: 'app.test' } }]);
      if (path.endsWith('/issue_quiz_passkey_challenge')) return json(issued);
      throw new Error(`unexpected ${path}`);
    }));
    const response = await call('options');
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).not.toHaveProperty('publicKey');
  });

  it('lê desafio retornado com o tipo JSON específico do PostgREST', async () => {
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      const path = new URL(input).pathname;
      if (path === '/auth/v1/user') return json({ id: user });
      if (path.endsWith('/user_roles')) return json([{ role: 'super_admin' }]);
      if (path.endsWith('/super_admin_accounts')) return json([{ id: 'account', ativo: true, bloqueado: false }]);
      if (path.endsWith('/is_active_quiz_super_admin_session')) return json(true);
      if (path.endsWith('/super_admin_passkeys')) return json([{ id: 'key', credential_id: 'credential', metadata: { rp_id: 'app.test' } }]);
      if (path.endsWith('/issue_quiz_passkey_challenge')) return new Response(JSON.stringify({ id: challengeId }), { headers: { 'content-type': 'application/vnd.pgrst.object+json; charset=utf-8' } });
      throw new Error(`unexpected ${path}`);
    }));
    const response = await call('options');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ challengeId, publicKey: expect.objectContaining({ rpId: 'app.test' }) }));
  });

  it('fails closed when issuance is rejected', async () => {
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      const path = new URL(input).pathname;
      if (path === '/auth/v1/user') return json({ id: user });
      if (path.endsWith('/user_roles')) return json([{ role: 'super_admin' }]);
      if (path.endsWith('/super_admin_accounts')) return json([{ id: 'account', ativo: true, bloqueado: false }]);
      if (path.endsWith('/is_active_quiz_super_admin_session')) return json(true);
      if (path.endsWith('/super_admin_passkeys')) return json([{ id: 'key', credential_id: 'credential', metadata: { rp_id: 'app.test' } }]);
      if (path.endsWith('/issue_quiz_passkey_challenge')) return new Response('limit reached', { status: 400 });
      throw new Error(`unexpected ${path}`);
    }));
    expect((await call('options')).status).toBe(503);
  });

  it('binds challenges to the verified session and rejects replay', async () => {
    vi.stubGlobal('crypto', webcrypto);
    let consumed = false;
    let consumeCalls = 0;
    let challengeHash = '';
    const mock = vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = new URL(input);
      const body = init.body ? JSON.parse(String(init.body)) : {};
      if (url.pathname === '/auth/v1/user') return json({ id: user });
      if (url.pathname.endsWith('/user_roles')) return json([{ role: 'super_admin' }]);
      if (url.pathname.endsWith('/super_admin_accounts')) return json([{ id: 'account', ativo: true, bloqueado: false }]);
      if (url.pathname.endsWith('/is_active_quiz_super_admin_session')) return json(body.p_auth_session_id === session);
      if (url.pathname.endsWith('/super_admin_passkeys')) return json([{ id: 'key', credential_id: 'credential', counter: 1, credential_public_key_jwk: {}, metadata: { rp_id: 'app.test' } }]);
      if (url.pathname.endsWith('/issue_quiz_passkey_challenge')) {
        expect(init.method).toBe('POST');
        expect(new Headers(init.headers).get('authorization')).toBe('Bearer service');
        expect(new Headers(init.headers).get('accept')).toBe('application/vnd.pgrst.object+json');
        expect(body).toEqual({ p_account_id: 'account', p_auth_user_id: user, p_auth_session_id: session, p_challenge_hash: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
        challengeHash = body.p_challenge_hash;
        return json({ id: challengeId });
      }
      if (url.pathname.endsWith('/consume_quiz_passkey_challenge')) {
        consumeCalls++;
        expect(body.p_challenge_hash).toBe(challengeHash);
        expect(body.p_auth_session_id).toBe(session);
        if (consumed) return new Response('replay', { status: 400 });
        consumed = true;
        return json({ id: 'grant' });
      }
      throw new Error(`unexpected ${url.pathname}`);
    });
    vi.stubGlobal('fetch', mock);
    const verifier = vi.spyOn(security, 'verifyAuthenticationResponse').mockResolvedValue({ counter: 2 });
    const options = await call('options');
    expect(options.status).toBe(200);
    const data = await options.json() as any;
    expect(data.publicKey.userVerification).toBe('required');
    const body = { challengeId, challenge: data.publicKey.challenge, credential: { id: 'credential' } };
    verifier.mockRejectedValueOnce(new Error('bad signature'));
    expect((await call('verify', body)).status).toBe(403);
    expect(consumeCalls).toBe(0);
    expect((await call('verify', body, token(user, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'))).status).toBe(403);
    expect(consumeCalls).toBe(0);
    expect((await call('verify', body, token(), 'https://evil.test')).status).toBe(503);
    expect(consumeCalls).toBe(0);
    expect((await call('verify', body)).status).toBe(200);
    expect((await call('verify', body)).status).not.toBe(200);
    expect(consumeCalls).toBe(2);
    expect(verifier).toHaveBeenCalledWith(expect.objectContaining({ expectedOrigin: env.QUIZ_PASSKEY_ORIGIN, rpId: env.QUIZ_PASSKEY_RP_ID, requireUserVerification: true }));
  });
});
