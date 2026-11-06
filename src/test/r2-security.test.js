import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { mayModifyR2Object } from '../../supabase/functions/_shared/r2-access.js';

describe('R2 object mutations', () => {
  const caller = { isSuperAdmin: false, userId: 'auth-1', profileId: 'profile-1' };
  it.each(['auth-1', 'profile-1'])('allows the authenticated owner %s', (owner) => {
    expect(mayModifyR2Object(caller, `escolas/school/arquivos-aula/${owner}/file.pdf`)).toBe(true);
  });
  it('denies another owner and malformed keys', () => {
    expect(mayModifyR2Object(caller, 'escolas/school/arquivos-aula/other/file.pdf')).toBe(false);
    expect(mayModifyR2Object(caller, 'escolas/school/arquivos-aula/profile-1')).toBe(false);
    expect(mayModifyR2Object(caller, 'escolas/school//profile-1/file.pdf')).toBe(false);
  });
  it('permits global admins only for structured keys', () => {
    const admin = { ...caller, isSuperAdmin: true };
    expect(mayModifyR2Object(admin, 'escolas/school/scope/other/file.pdf')).toBe(true);
    expect(mayModifyR2Object(admin, 'invalid')).toBe(false);
  });
  it('applies the same mutation check in both backends and never puts session tokens in download URLs', () => {
    const gateway = readFileSync('cloudflare/api-gateway/src/index.ts', 'utf8');
    const edge = readFileSync('supabase/functions/r2-storage/index.ts', 'utf8');
    expect(gateway).toContain('mayModifyR2Object');
    expect(edge).toContain('mayModifyR2Object');
    expect(gateway).not.toContain('accessToken: token');
    expect(gateway).toContain('downloadViaApi: true');
  });
});
