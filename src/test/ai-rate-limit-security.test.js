import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkAiRateLimit } from '../../supabase/functions/_shared/ai-rate-limit.js';

describe('AI rate-limit security', () => {
  it.each([
    [{ data: true, error: null }, true],
    [{ data: false, error: null }, false],
    [{ data: null, error: { message: 'database unavailable' } }, false],
    [{ data: true, error: { message: 'database error' } }, false],
  ])('accepts only an explicit successful result', async (result, expected) => {
    const rpc = vi.fn().mockReturnValue({ single: async () => result });
    expect(await checkAiRateLimit({ rpc }, 'ai:user:/text', 60, 60)).toBe(expected);
    expect(rpc).toHaveBeenCalledWith('check_ai_rate_limit', {
      _key: 'ai:user:/text', _limit: 60, _window_seconds: 60,
    });
  });

  it('denies on exceptions', async () => {
    expect(await checkAiRateLimit({ rpc: () => { throw new Error('offline'); } }, 'key', 60, 60)).toBe(false);
  });

  it('uses a user-bound bucket and restricts direct access to the RPC', () => {
    const proxy = readFileSync('supabase/functions/cloudflare-ai-proxy/index.ts', 'utf8');
    const migration = readFileSync('supabase/migrations/20261107000000_restrict_rate_limit_rpc.sql', 'utf8');
    expect(proxy).toContain('`ai:${userId}:${path}`');
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon, authenticated/);
  });
});
