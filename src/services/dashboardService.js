import { requestPlatformApi } from '@/lib/platformApi';

export async function fetchDashboardData(userRole) {
  const query = userRole ? `?role=${encodeURIComponent(userRole)}` : '';
  const payload = await requestPlatformApi(`/v1/dashboard${query}`);
  return {
    stats: payload?.stats || {},
    atividades: Array.isArray(payload?.atividades) ? payload.atividades : [],
    emprestimosPorMes: Array.isArray(payload?.emprestimosPorMes) ? payload.emprestimosPorMes : [],
    livrosMaisEmprestados: Array.isArray(payload?.livrosMaisEmprestados) ? payload.livrosMaisEmprestados : [],
    escolasCadastradas: Array.isArray(payload?.escolasCadastradas) ? payload.escolasCadastradas : [],
    superAdminStats: payload?.superAdminStats || null,
  };
}
