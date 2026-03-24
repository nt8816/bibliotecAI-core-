import { requestPlatformApi } from '@/lib/platformApi';

export async function fetchEmprestimosData() {
  const payload = await requestPlatformApi('/v1/emprestimos');
  return {
    escolaId: payload?.escolaId || null,
    emprestimos: Array.isArray(payload?.emprestimos) ? payload.emprestimos : [],
    solicitacoes: Array.isArray(payload?.solicitacoes) ? payload.solicitacoes : [],
    livrosCatalogo: Array.isArray(payload?.livrosCatalogo) ? payload.livrosCatalogo : [],
    livrosDisponiveis: Array.isArray(payload?.livrosDisponiveis) ? payload.livrosDisponiveis : [],
    usuarios: Array.isArray(payload?.usuarios) ? payload.usuarios : [],
  };
}

export async function createEmprestimo(payload) {
  return requestPlatformApi('/v1/emprestimos', { method: 'POST', body: payload });
}

export async function registerEmprestimoDevolucao(emprestimoId) {
  return requestPlatformApi(`/v1/emprestimos/${emprestimoId}/devolucao`, { method: 'POST' });
}

export async function approveSolicitacaoEmprestimo(solicitacaoId, resposta) {
  return requestPlatformApi(`/v1/solicitacoes-emprestimo/${solicitacaoId}/aprovar`, {
    method: 'POST',
    body: { resposta },
  });
}

export async function rejectSolicitacaoEmprestimo(solicitacaoId, resposta) {
  return requestPlatformApi(`/v1/solicitacoes-emprestimo/${solicitacaoId}/recusar`, {
    method: 'POST',
    body: { resposta },
  });
}

export async function markSolicitacaoLivroIndisponivel(solicitacaoId, resposta) {
  return requestPlatformApi(`/v1/solicitacoes-emprestimo/${solicitacaoId}/indisponivel`, {
    method: 'POST',
    body: { resposta },
  });
}

export async function createHistoricEmprestimo(payload) {
  return requestPlatformApi('/v1/emprestimos/historico', { method: 'POST', body: payload });
}

export async function deleteHistoricEmprestimo(emprestimoId) {
  return requestPlatformApi(`/v1/emprestimos/${emprestimoId}/delete`, { method: 'POST' });
}
