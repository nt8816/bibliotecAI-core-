import { createSign, generateKeyPairSync, webcrypto } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { routes } from './index';

const user = '12345678-1234-1234-1234-123456789abc';
const env = { SUPABASE_URL: 'https://principal.test', SUPABASE_PUBLISHABLE_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_JWT_SECRET: 'secret' };
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'key-1', alg: 'ES256', use: 'sig' };
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
function token(overrides: Record<string, unknown> = {}, kid = 'key-1') {
  const signed = `${encode({ alg: 'ES256', kid, typ: 'JWT' })}.${encode({ sub: user, role: 'authenticated', iss: 'https://principal.test/auth/v1', iat: now, exp: now + 3600, ...overrides })}`;
  const signer = createSign('SHA256'); signer.update(signed); signer.end();
  return `${signed}.${signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
function setup(keys: unknown = [jwk]) {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/auth/v1/user')) return json({ id: user });
    if (url.pathname.endsWith('/user_roles')) return json([{ role: 'aluno' }, { role: 'super_admin' }]);
    if (url.pathname.endsWith('/super_admin_accounts')) return json([{ id: 'admin', ativo: true, bloqueado: false, ultimo_mfa_em: new Date(now * 1000).toISOString() }]);
    if (url.pathname.endsWith('/.well-known/jwks.json')) return json({ keys });
    throw new Error(`unexpected ${url.pathname}`);
  }));
}
const invoke = (jwt: string) => routes['GET /v1/auth/session'](new Request('https://gateway.test/v1/auth/session', { headers: { authorization: `Bearer ${jwt}` } }), env as never);
afterEach(() => vi.unstubAllGlobals());

it('aceita sessão ES256 assinada por chave confiável e preserva papel de superadmin', async () => {
  setup(); const response = await invoke(token());
  expect(response.status).toBe(200); expect((await response.json()).roles).toEqual(['aluno', 'super_admin']);
});
it('recusa assinatura adulterada mesmo quando o serviço de identidade responde com usuário', async () => {
  setup(); const parts = token().split('.'); parts[1] = encode({ sub: user, iss: 'https://principal.test/auth/v1', iat: now, exp: now + 3600, role: 'authenticated', altered: true });
  expect((await invoke(parts.join('.'))).status).toBe(403);
});
it('recusa chave desconhecida e chaves duplicadas', async () => {
  setup(); expect((await invoke(token({}, 'unknown'))).status).toBe(403);
  setup([jwk, jwk]); expect((await invoke(token())).status).toBe(403);
});
it('recusa token expirado ou emitido por outro projeto', async () => {
  setup(); expect((await invoke(token({ exp: now - 1 }))).status).toBe(403);
  expect((await invoke(token({ iss: 'https://other.test/auth/v1' }))).status).toBe(403);
});
it('nega acesso se o conjunto de chaves não estiver disponível', async () => {
  setup(null); expect((await invoke(token())).status).toBe(403);
});
