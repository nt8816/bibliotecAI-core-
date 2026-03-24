import { requestPlatformApi } from '@/lib/platformApi';

export async function fetchRelatoriosData() {
  const payload = await requestPlatformApi('/v1/relatorios');
  return {
    stats: payload?.stats || {},
    livrosMaisEmprestados: Array.isArray(payload?.livrosMaisEmprestados) ? payload.livrosMaisEmprestados : [],
    emprestimosPorMes: Array.isArray(payload?.emprestimosPorMes) ? payload.emprestimosPorMes : [],
  };
}
