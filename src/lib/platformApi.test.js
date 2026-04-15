import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/platformSession', () => ({
  getPlatformAccessToken: vi.fn(() => 'fake-token'),
  refreshPlatformSession: vi.fn(async () => null),
}));

describe('requestPlatformApi write guard', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('bloqueia mutacoes fora de producao quando o guard esta readonly', async () => {
    vi.stubEnv('VITE_PLATFORM_API_BASE_URL', 'https://bibliotecai-api-gateway.bibliotecai.workers.dev');
    vi.stubEnv('VITE_APP_ENV', 'homolog');
    vi.stubEnv('VITE_APP_ENV_LABEL', 'Homologacao');
    vi.stubEnv('VITE_APP_WRITE_GUARD', 'readonly');
    vi.stubEnv('VITE_ALLOW_REAL_WRITES', 'false');

    const { requestPlatformApi } = await import('@/lib/platformApi');

    await expect(requestPlatformApi('/v1/usuarios', { method: 'POST', body: { nome: 'Teste' } }))
      .rejects
      .toMatchObject({
        status: 403,
        writeGuard: true,
      });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('permite rotas de autenticacao mesmo com guard readonly', async () => {
    vi.stubEnv('VITE_PLATFORM_API_BASE_URL', 'https://bibliotecai-api-gateway.bibliotecai.workers.dev');
    vi.stubEnv('VITE_APP_ENV', 'homolog');
    vi.stubEnv('VITE_APP_WRITE_GUARD', 'readonly');
    vi.stubEnv('VITE_ALLOW_REAL_WRITES', 'false');

    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: {
        get: () => 'application/json',
      },
      json: async () => ({ ok: true }),
    }));

    const { requestPlatformApi } = await import('@/lib/platformApi');
    const response = await requestPlatformApi('/v1/auth/login', {
      method: 'POST',
      body: { email: 'teste@teste.com' },
      auth: false,
    });

    expect(response).toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
