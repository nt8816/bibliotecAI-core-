import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getStats, trackSection, trackEvent, clearAnalytics } from '@/hooks/useAnalytics';

const ROOT = process.cwd();
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

describe('Analytics fixes', () => {
  beforeEach(() => {
    clearAnalytics();
  });

  it('Bug 7: sectionCounts key uses event name, not data.action', () => {
    trackSection('Hero', 'view');
    trackSection('Hero', 'view');
    trackSection('Solucao', 'exit');

    const stats = getStats();
    expect(stats.sections).toHaveProperty('Hero_view');
    expect(stats.sections).toHaveProperty('Solucao_exit');
    expect(stats.sections['Hero_view']).toBe(2);
    expect(stats.sections['Solucao_exit']).toBe(1);
    const keys = Object.keys(stats.sections);
    expect(keys.some(k => k.includes('undefined'))).toBe(false);
  });

  it('Bug 9: getStats does not crash when scroll data is null', () => {
    const store = JSON.parse(localStorage.getItem('bibliotecai_analytics') || '{"events":[]}');
    store.events.push({
      id: 'test-null', name: 'scroll_depth', data: null,
      ts: Date.now(), sid: 'test', path: '/',
    });
    store.events.push({
      id: 'test-valid', name: 'scroll_depth', data: { depth: 50 },
      ts: Date.now(), sid: 'test', path: '/',
    });
    localStorage.setItem('bibliotecai_analytics', JSON.stringify(store));

    const stats = getStats();
    expect(stats.maxScrollDepth).toBe(50);
  });

  it('getStats handles empty events gracefully', () => {
    const stats = getStats();
    expect(stats.totalEvents).toBe(0);
    expect(stats.pageViews).toBe(0);
    expect(stats.maxScrollDepth).toBe(0);
    expect(stats.sections).toEqual({});
    expect(stats.clicks).toEqual({});
  });
});

describe('Dashboard service', () => {
  it('Bug 1: fetchDashboardData forwards userRole parameter', async () => {
    const { fetchDashboardData } = await import('@/services/dashboardService');
    const mod = await import('@/lib/platformApi');
    const spy = vi.spyOn(mod, 'requestPlatformApi').mockResolvedValue({});

    await fetchDashboardData('super_admin');
    expect(spy).toHaveBeenCalledWith('/v1/dashboard?role=super_admin');

    spy.mockClear();
    await fetchDashboardData();
    expect(spy).toHaveBeenCalledWith('/v1/dashboard');

    spy.mockRestore();
  });
});

describe('Usuarios service', () => {
  it('Bug 13: fetchUsuariosModuleData forwards parameters', async () => {
    const { fetchUsuariosModuleData } = await import('@/services/usuariosService');
    const mod = await import('@/lib/platformApi');
    const spy = vi.spyOn(mod, 'requestPlatformApi').mockResolvedValue({});

    await fetchUsuariosModuleData({ userId: 'u123', tenantEscolaId: 'e456' });
    expect(spy).toHaveBeenCalledWith('/v1/usuarios?userId=u123&escolaId=e456');

    spy.mockClear();
    await fetchUsuariosModuleData();
    expect(spy).toHaveBeenCalledWith('/v1/usuarios');

    spy.mockRestore();
  });
});

describe('CORS localhost removal (L6)', () => {
  it('_shared/cors.ts excludes localhost in production', () => {
    const content = read('supabase/functions/_shared/cors.ts');
    expect(content).toContain('isDev');
    expect(content).toContain("...(isDev ? ['http://localhost:5173'");
  });
});

describe('Edge Function security', () => {
  it('processar-arquivo has auth check', () => {
    const content = read('supabase/functions/processar-arquivo/index.js');
    expect(content).toContain('Authorization');
    expect(content).toContain('getUser');
  });

  it('excluir-escola-tenant has CORS definition and no BOM', () => {
    const content = read('supabase/functions/excluir-escola-tenant/index.ts');
    expect(content).toContain('ALLOWED_ORIGINS');
    expect(content).toContain('getCorsHeaders');
    expect(content.charCodeAt(0)).not.toBe(0xFEFF);
  });

  it('cloudflare-ai-proxy uses req not request in Deno.serve handler', () => {
    const content = read('supabase/functions/cloudflare-ai-proxy/index.ts');
    // Find the Deno.serve handler body (after line ~159)
    const serveIdx = content.indexOf('Deno.serve(async (req)');
    const handlerBody = content.slice(serveIdx);
    // In the handler, getCorsHeaders should use 'req', not 'request'
    const getCorsCalls = handlerBody.match(/getCorsHeaders\((\w+)\)/g) || [];
    const badCalls = getCorsCalls.filter(c => c.includes('(request)'));
    expect(badCalls).toEqual([]);
  });

  it('r2-storage sanitizes filename against header injection', () => {
    const content = read('supabase/functions/r2-storage/index.ts');
    expect(content).toContain('[^a-zA-Z0-9._-]');
  });

  it('redefinir-senha-aluno has rate limiting', () => {
    const content = read('supabase/functions/redefinir-senha-aluno/index.ts');
    expect(content).toContain('checkRateLimit');
    expect(content).toContain('reset-aluno');
  });

  it('provisionar-aluno-matricula generates random passwords', () => {
    const content = read('supabase/functions/provisionar-aluno-matricula/index.ts');
    expect(content).toContain('generateSecurePassword');
    expect(content).toContain('crypto.getRandomValues');
  });

  it('ativar-aluno-matricula uses anon key for auth validation', () => {
    const content = read('supabase/functions/ativar-aluno-matricula/index.ts');
    expect(content).toContain('SUPABASE_ANON_KEY');
  });

  it('excluir-escola-tenant verifies super_admin_accounts', () => {
    const content = read('supabase/functions/excluir-escola-tenant/index.ts');
    expect(content).toContain('super_admin_accounts');
    expect(content).toContain('bloqueado');
  });

  it('gerenciar-super-admins verifies super_admin_accounts', () => {
    const content = read('supabase/functions/gerenciar-super-admins/index.ts');
    expect(content).toContain('super_admin_accounts');
  });

  it('redefinir-senha-gestor has rate limiting', () => {
    const content = read('supabase/functions/redefinir-senha-gestor/index.ts');
    expect(content).toContain('checkRateLimit');
    expect(content).toContain('reset-gestor');
  });

  it('registrar-via-convite has rate limiting', () => {
    const content = read('supabase/functions/registrar-via-convite/index.ts');
    expect(content).toContain('checkRateLimit');
    expect(content).toContain('registrar-convite');
  });
});

describe('Analytics RLS (M4)', () => {
  it('migration restricts analytics to service_role only', () => {
    const content = read('supabase/migrations/20260710100000_analytics_tables.sql');
    expect(content).toContain('service_role');
    expect(content).not.toMatch(/USING\s*\(true\)\s*WITH CHECK\s*\(true\)/);
  });
});

describe('App QueryClient (Bug 5)', () => {
  it('creates QueryClient inside component via useState', () => {
    const content = read('src/App.jsx');
    expect(content).toContain('useState(() => new QueryClient');
  });
});

describe('API Gateway (C2, H1)', () => {
  it('parseJwtPayload verifies HMAC signature', () => {
    const content = read('cloudflare/api-gateway/src/index.ts');
    expect(content).toContain('crypto.subtle.verify');
    expect(content).toContain('SUPABASE_JWT_SECRET');
  });

  it('x-profile-role-hint removed from CORS headers', () => {
    const content = read('cloudflare/api-gateway/src/index.ts');
    expect(content).not.toContain('x-profile-role-hint');
  });
});

describe('Rate limiting on all 5 mutation endpoints', () => {
  const endpoints = [
    { file: 'supabase/functions/redefinir-senha-aluno/index.ts', key: 'reset-aluno' },
    { file: 'supabase/functions/redefinir-senha-gestor/index.ts', key: 'reset-gestor' },
    { file: 'supabase/functions/provisionar-aluno-matricula/index.ts', key: 'provisionar-aluno' },
    { file: 'supabase/functions/registrar-gestor-tenant/index.ts', key: 'registrar-gestor' },
    { file: 'supabase/functions/registrar-via-convite/index.ts', key: 'registrar-convite' },
  ];

  endpoints.forEach(({ file, key }) => {
    it(`${file.split('/')[2]} has rate limiting with key "${key}"`, () => {
      const content = read(file);
      expect(content).toContain('checkRateLimit');
      expect(content).toContain(key);
    });
  });
});
