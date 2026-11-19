// @vitest-environment node
import { createHash, createHmac, webcrypto } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import gateway from './index';

const user = '12345678-1234-1234-1234-123456789abc';
const session = '12345678-1234-1234-1234-123456789def';
const account = '12345678-1234-1234-1234-123456789aaa';
const passkeyId = '12345678-1234-1234-1234-123456789bbb';
const challengeId = '12345678-1234-1234-1234-123456789ccc';
const grantId = '12345678-1234-1234-1234-123456789ddd';
const credentialId = Buffer.from('credential-id').toString('base64url');
const env = { SUPABASE_URL: 'https://principal.test', SUPABASE_PUBLISHABLE_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_JWT_SECRET: 'secret', QUIZ_PASSKEY_ORIGIN: 'https://app.test', QUIZ_PASSKEY_RP_ID: 'app.test' };
const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } });
const hash = (v: string) => createHash('sha256').update(v).digest('base64url');
const identity = { p_account_id: account, p_auth_user_id: user, p_auth_session_id: session };
function token() {
  const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const input = `${encode({ alg: 'HS256' })}.${encode({ sub: user, session_id: session, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 300 })}`;
  return `${input}.${createHmac('sha256', 'secret').update(input).digest('base64url')}`;
}
function call(path: string, body: object = {}) {
  return gateway.fetch(new Request(`https://gateway.test/v1/admin/quiz/passkeys/${path}`, { method: 'POST', headers: { authorization: `Bearer ${token()}`, origin: env.QUIZ_PASSKEY_ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify(body) }), env as never);
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function setup(legacy = false) {
  vi.stubGlobal('crypto', webcrypto);
  const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicKey = await webcrypto.subtle.exportKey('jwk', keys.publicKey);
  let storedHash = '';
  let consumed = false;
  let counter = 1;
  let consumeCalls = 0;
  let grants = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const body = init.body ? JSON.parse(String(init.body)) : {};
    if (url.pathname === '/auth/v1/user') return json({ id: user });
    if (url.pathname.endsWith('/user_roles')) return json([{ role: 'super_admin' }]);
    if (url.pathname.endsWith('/super_admin_accounts')) return json([{ id: account, ativo: true, bloqueado: false }]);
    if (url.pathname.endsWith('/is_active_quiz_super_admin_session')) return json(JSON.stringify(body) === JSON.stringify(identity));
    if (url.pathname.endsWith('/super_admin_passkeys')) return json([{ id: passkeyId, account_id: account, credential_id: credentialId, credential_public_key_jwk: publicKey, counter, transports: [], revoked_at: null, metadata: legacy ? {} : { rp_id: 'app.test' } }]);
    if (url.pathname.endsWith('/issue_quiz_passkey_challenge')) {
      expect(body).toEqual({ ...identity, p_challenge_hash: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
      expect(new Headers(init.headers).get('authorization')).toBe('Bearer service');
      storedHash = body.p_challenge_hash;
      const now = Date.now();
      return json({ id: challengeId, account_id: account, auth_user_id: user, auth_session_id: session, challenge_hash: storedHash, created_at: new Date(now).toISOString(), expires_at: new Date(now + 300000).toISOString(), approved_at: null, consumed_at: null });
    }
    if (url.pathname.endsWith('/consume_quiz_passkey_challenge')) {
      consumeCalls++;
      expect(new Headers(init.headers).get('authorization')).toBe('Bearer service');
      if (consumed || body.p_challenge_id !== challengeId || body.p_challenge_hash !== storedHash || body.p_credential_id !== credentialId || body.p_counter <= counter || Object.entries(identity).some(([k, v]) => body[k] !== v)) return new Response('invalid challenge', { status: 400 });
      consumed = true;
      counter = body.p_counter;
      grants++;
      const now = Date.now();
      return json({ id: grantId, challenge_id: challengeId, passkey_id: passkeyId, account_id: account, auth_user_id: user, auth_session_id: session, created_at: new Date(now).toISOString(), expires_at: new Date(now + 300000).toISOString() });
    }
    throw new Error(`unexpected ${url.pathname}`);
  }));
  const options = await call('options');
  expect(options.status).toBe(200);
  const data = await options.json() as any;
  expect(data.publicKey.userVerification).toBe('required');
  expect(data.challengeId).toBe(challengeId);
  expect(hash(data.publicKey.challenge)).toBe(storedHash);
  async function assertion(challenge: string, flags = 0x05, badSignature = false, rpId = env.QUIZ_PASSKEY_RP_ID) {
    const client = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin: env.QUIZ_PASSKEY_ORIGIN }));
    const auth = Buffer.concat([createHash('sha256').update(rpId).digest(), Buffer.from([flags, 0, 0, 0, 2])]);
    const signed = Buffer.concat([auth, createHash('sha256').update(client).digest()]);
    const signature = Buffer.from(await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, signed));
    if (badSignature) signature[0] ^= 1;
    return { id: credentialId, type: 'public-key', response: { clientDataJSON: client.toString('base64url'), authenticatorData: auth.toString('base64url'), signature: signature.toString('base64url') } };
  }
  return { challenge: data.publicKey.challenge as string, assertion, state: () => ({ consumeCalls, grants, counter }) };
}

it('accepts a real ECDSA assertion and rejects replay', async () => {
  const s = await setup();
  const body = { challengeId, challenge: s.challenge, credential: await s.assertion(s.challenge) };
  expect((await call('verify', body)).status).toBe(200);
  expect(s.state()).toEqual({ consumeCalls: 1, grants: 1, counter: 2 });
  expect((await call('verify', body)).status).not.toBe(200);
  expect(s.state().grants).toBe(1);
});

it('rejects an incorrect ECDSA signature without consuming', async () => {
  const s = await setup();
  expect((await call('verify', { challengeId, challenge: s.challenge, credential: await s.assertion(s.challenge, 0x05, true) })).status).toBe(403);
  expect(s.state()).toEqual({ consumeCalls: 0, grants: 0, counter: 1 });
});

it('rejects a correctly signed assertion without user verification', async () => {
  const s = await setup();
  expect((await call('verify', { challengeId, challenge: s.challenge, credential: await s.assertion(s.challenge, 0x01) })).status).toBe(403);
  expect(s.state()).toEqual({ consumeCalls: 0, grants: 0, counter: 1 });
});

it('rejects a different signed client challenge without consuming', async () => {
  const s = await setup();
  const different = Buffer.alloc(32, 7).toString('base64url');
  expect((await call('verify', { challengeId, challenge: s.challenge, credential: await s.assertion(different) })).status).toBe(403);
  expect(s.state()).toEqual({ consumeCalls: 0, grants: 0, counter: 1 });
});

it('rejects a valid assertion for a challenge different from the issued one', async () => {
  const s = await setup();
  const different = Buffer.alloc(32, 7).toString('base64url');
  expect((await call('verify', { challengeId, challenge: different, credential: await s.assertion(different) })).status).toBe(503);
  expect(s.state()).toEqual({ consumeCalls: 1, grants: 0, counter: 1 });
});


it('aceita credencial antiga sem metadado somente após verificar assinatura e RP', async () => {
  const s = await setup(true);
  const body = { challengeId, challenge: s.challenge, credential: await s.assertion(s.challenge) };
  expect((await call('verify', body)).status).toBe(200);
  expect(s.state().grants).toBe(1);
});

it('recusa assinatura inválida de credencial antiga sem conceder acesso', async () => {
  const s = await setup(true);
  const body = { challengeId, challenge: s.challenge, credential: await s.assertion(s.challenge, 0x05, true) };
  expect((await call('verify', body)).status).toBe(403);
  expect(s.state().grants).toBe(0);
});


it('recusa credencial antiga assinada para outro domínio', async () => {
  const s = await setup(true);
  const body = { challengeId, challenge: s.challenge, credential: await s.assertion(s.challenge, 0x05, false, 'outro.test') };
  expect((await call('verify', body)).status).toBe(403);
  expect(s.state().grants).toBe(0);
});
