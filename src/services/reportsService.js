import { requestPlatformApi } from '@/lib/platformApi';

export async function fetchReportsData() {
  const payload = await requestPlatformApi('/v1/relatorios');
  return {
    stats: payload?.stats || null,
    emprestimosDetalhados: Array.isArray(payload?.emprestimosDetalhados) ? payload.emprestimosDetalhados : [],
    emprestimosPorMes: Array.isArray(payload?.emprestimosPorMes) ? payload.emprestimosPorMes : [],
    livrosMaisEmprestados: Array.isArray(payload?.livrosMaisEmprestados) ? payload.livrosMaisEmprestados : [],
  };
}
