import { requestPlatformApi } from '@/lib/platformApi';

export async function fetchDashboardData() {
  const payload = await requestPlatformApi('/v1/dashboard');
  return {
    stats: payload?.stats || {},
    atividades: Array.isArray(payload?.atividades) ? payload.atividades : [],
    emprestimosPorMes: Array.isArray(payload?.emprestimosPorMes) ? payload.emprestimosPorMes : [],
    livrosMaisEmprestados: Array.isArray(payload?.livrosMaisEmprestados) ? payload.livrosMaisEmprestados : [],
    escolasCadastradas: Array.isArray(payload?.escolasCadastradas) ? payload.escolasCadastradas : [],
    superAdminStats: payload?.superAdminStats || null,
  };
}
