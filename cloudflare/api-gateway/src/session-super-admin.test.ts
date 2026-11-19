import { createHmac, webcrypto } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { routes } from './index';

const user = '12345678-1234-1234-1234-123456789abc';
const env = { SUPABASE_URL: 'https://principal.test', SUPABASE_PUBLISHABLE_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_JWT_SECRET: 'secret' };
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const iat = Math.floor(Date.now() / 1000);
const unsigned = `${encode({ alg: 'HS256' })}.${encode({ sub: user, role: 'authenticated', iat, exp: iat + 3600 })}`;
const token = `${unsigned}.${createHmac('sha256', env.SUPABASE_JWT_SECRET).update(unsigned).digest('base64url')}`;
const request = () => new Request('https://gateway.test/v1/auth/session', { headers: { authorization: `Bearer ${token}` } });
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
function setup(mfa: string | null) {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/auth/v1/user')) return json({ id: user });
    if (url.pathname.endsWith('/user_roles')) return json([{ role: 'aluno' }, { role: 'super_admin' }]);
    if (url.pathname.endsWith('/super_admin_accounts')) return json([{ id: 'admin', ativo: true, bloqueado: false, ultimo_mfa_em: mfa }]);
    throw new Error(`unexpected ${url.pathname}`);
  }));
}
afterEach(() => vi.unstubAllGlobals());

it('não encaminha superadmin com aluno para aluno quando a confirmação reforçada expirou', async () => {
  setup(new Date((iat - 60) * 1000).toISOString());
  const response = await routes['GET /v1/auth/session'](request(), env as never);
  expect(response.status).toBe(403);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual(expect.objectContaining({ requires_super_admin_security: true }));
});

it('mantém ambos os perfis quando a confirmação reforçada é válida', async () => {
  setup(new Date(iat * 1000).toISOString());
  const response = await routes['GET /v1/auth/session'](request(), env as never);
  expect(response.status).toBe(200);
  expect((await response.json()).roles).toEqual(['aluno', 'super_admin']);
});
