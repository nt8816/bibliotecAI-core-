import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import gateway from './index';

afterEach(() => vi.unstubAllGlobals());

describe('quiz administrativo indisponivel sem step-up verificavel', () => {
  it.each(['/v1/admin/quiz/session', '/v1/admin/quiz/contacts?round_id=12345678-1234-1234-1234-123456789abc', '/v1/admin/quiz/display/rounds', '/v1/admin/quiz/display/leaderboard?round_id=12345678-1234-1234-1234-123456789abc', '/v1/admin/quiz/future-route'])(
    'nega %s independentemente do token e sem acessar bancos', async (path) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      for (const token of ['', 'forged', 'apparently-valid']) {
        const headers = token ? { authorization: `Bearer ${token}` } : {};
        const response = await gateway.fetch(new Request(`https://gateway.test${path}`, { headers }), {} as never);
        expect(response.status).toBe(503);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(await response.json()).toEqual({ success: false, error: 'Autenticacao reforcada indisponivel.' });
      }
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(['/v1/admin/quiz/session', '/v1/admin/quiz/contacts?round_id=12345678-1234-1234-1234-123456789abc', '/v1/admin/quiz/display/rounds', '/v1/admin/quiz/display/leaderboard?round_id=12345678-1234-1234-1234-123456789abc', '/v1/admin/quiz/future-route'])(
    'mantem %s bloqueado mesmo com sessoes assinadas e configuracao completa', async (path) => {
      const secret = 'local-test-secret';
      const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const tokenFor = (sessionId: string) => {
        const payload = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
          sub: '12345678-1234-1234-1234-123456789def', session_id: sessionId,
          aal: 'aal2', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
        })}`;
        return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
      };
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const env = {
        SUPABASE_URL: 'https://principal.test', SUPABASE_PUBLISHABLE_KEY: 'anon',
        SUPABASE_SERVICE_ROLE_KEY: 'principal-secret', SUPABASE_JWT_SECRET: secret,
        QUIZ_SUPABASE_URL: 'https://quiz.test', QUIZ_SUPABASE_SERVICE_ROLE_KEY: 'quiz-secret',
      };
      for (const sessionId of ['first-session', 'second-session']) {
        const response = await gateway.fetch(new Request(`https://gateway.test${path}`, {
          headers: { authorization: `Bearer ${tokenFor(sessionId)}` },
        }), env as never);
        expect(response.status).toBe(503);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(await response.text()).not.toContain('secret');
      }
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
