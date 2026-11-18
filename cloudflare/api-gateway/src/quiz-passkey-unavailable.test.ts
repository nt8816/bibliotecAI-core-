import { createHmac, webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import gateway from './index';

const user = '12345678-1234-1234-1234-123456789abc';
const session = '12345678-1234-1234-1234-123456789def';
const env = { SUPABASE_URL: 'https://principal.test', SUPABASE_PUBLISHABLE_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_JWT_SECRET: 'secret' };
const token = (sub = user, sessionId = session) => {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode({ alg: 'HS256' })}.${encode({ sub, session_id: sessionId, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 300 })}`;
  return `${input}.${createHmac('sha256', env.SUPABASE_JWT_SECRET).update(input).digest('base64url')}`;
};
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
const call = (path: string, bearer: string, body: object = {}) => gateway.fetch(new Request(`https://gateway.test${path}`, {
  method: 'POST', headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
}), env as never);

afterEach(() => vi.unstubAllGlobals());

describe('confirmacao de passkey do quiz indisponivel', () => {
  it.each(['/v1/admin/quiz/passkeys/options', '/v1/admin/quiz/passkeys/verify'])('falha fechada em %s inclusive replay e outra sessao', async path => {
    vi.stubGlobal('crypto', webcrypto);
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/auth/v1/user')) return json({ id: user });
      if (url.includes('/user_roles?')) return json([{ role: 'super_admin' }]);
      if (url.includes('/super_admin_accounts?')) {
        expect(new URL(url).searchParams.get('auth_user_id')).toBe(`eq.${user}`);
        return json([{ id: 'account', ativo: true, bloqueado: false }]);
      }
      throw new Error('unexpected access');
    });
    vi.stubGlobal('fetch', fetchMock);
    for (const bearer of [token(), token(), token(user, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')]) {
      const response = await call(path, bearer, { challenge: 'replay', session_id: session, origin: 'https://attacker.test' });
      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect(fetchMock).toHaveBeenCalledTimes(9);
  });

  it('rejeita sub diferente, sessao ausente e conta inativa', async () => {
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/auth/v1/user')) return json({ id: user });
      if (url.includes('/user_roles?')) return json([{ role: 'super_admin' }]);
      if (url.includes('/super_admin_accounts?')) return json([{ id: 'account', ativo: false, bloqueado: false }]);
      throw new Error('unexpected access');
    }));
    expect((await call('/v1/admin/quiz/passkeys/verify', token('other'))).status).toBe(401);
    expect((await call('/v1/admin/quiz/passkeys/verify', token(user, ''))).status).toBe(401);
    expect((await call('/v1/admin/quiz/passkeys/options', token())).status).toBe(403);
  });
});
