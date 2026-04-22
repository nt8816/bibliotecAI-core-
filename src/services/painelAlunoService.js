import { requestPlatformApi } from '@/lib/platformApi';

export async function fetchPainelAlunoData() {
  const payload = await requestPlatformApi('/v1/aluno/painel');
  return {
    success: true,
    perfil: payload?.perfil || null,
    emprestimos: Array.isArray(payload?.emprestimos) ? payload.emprestimos : [],
    avaliacoes: Array.isArray(payload?.avaliacoes) ? payload.avaliacoes : [],
    wishlist: Array.isArray(payload?.wishlist) ? payload.wishlist : [],
    sugestoes: Array.isArray(payload?.sugestoes) ? payload.sugestoes : [],
    solicitacoes: Array.isArray(payload?.solicitacoes) ? payload.solicitacoes : [],
    atividades: Array.isArray(payload?.atividades) ? payload.atividades : [],
    comunicados: Array.isArray(payload?.comunicados) ? payload.comunicados : [],
    entregas: Array.isArray(payload?.entregas) ? payload.entregas : [],
    audiobookCatalogo: Array.isArray(payload?.audiobookCatalogo) ? payload.audiobookCatalogo : [],
    meusAudiobooks: Array.isArray(payload?.meusAudiobooks) ? payload.meusAudiobooks : [],
    criacoesLaboratorio: Array.isArray(payload?.criacoesLaboratorio) ? payload.criacoesLaboratorio : [],
    notificacoesLidas: Array.isArray(payload?.notificacoesLidas) ? payload.notificacoesLidas : [],
    preferenciasAluno: payload?.preferenciasAluno || null,
  };
}

export async function fetchPainelAlunoBooks({ escolaId, searchTerm }) {
  const payload = await requestPlatformApi('/v1/livros');
  const normalizedTerm = String(searchTerm || '').trim().toLowerCase();
  let items = Array.isArray(payload?.livros) ? payload.livros : [];

  if (escolaId) {
    items = items.filter((item) => !item?.escola_id || String(item.escola_id) === String(escolaId));
  }

  if (normalizedTerm) {
    items = items.filter((item) =>
      [item?.titulo, item?.autor, item?.area].some((value) =>
        String(value || '').toLowerCase().includes(normalizedTerm),
      ),
    );
  }

  return {
    success: true,
    livros: items,
  };
}

export async function updatePainelAlunoPassword({ password, metadata }) {
  return requestPlatformApi('/v1/auth/password', {
    method: 'POST',
    body: { password, metadata },
  });
}

export async function togglePainelAlunoWishlist({ livroId, alunoId, enabled }) {
  return requestPlatformApi('/v1/aluno/wishlist/toggle', {
    method: 'POST',
    body: { livroId, alunoId, enabled },
  });
}

export async function createPainelAlunoLoanRequest({ livroId, mensagem }) {
  return requestPlatformApi('/v1/aluno/solicitacoes-emprestimo', {
    method: 'POST',
    body: { livroId, mensagem },
  });
}

export async function createPainelAlunoLoanExtensionRequest({
  livroId,
  emprestimoId,
  mensagem,
  dataDevolucaoAtual,
  novaDataDevolucaoSolicitada,
}) {
  return requestPlatformApi('/v1/aluno/solicitacoes-emprestimo/prorrogacao', {
    method: 'POST',
    body: {
      livroId,
      emprestimoId,
      mensagem,
      dataDevolucaoAtual,
      novaDataDevolucaoSolicitada,
    },
  });
}

export async function sendPainelAlunoSolicitacaoChatMessage({ solicitacaoId, mensagem }) {
  return requestPlatformApi(`/v1/aluno/solicitacoes-emprestimo/${solicitacaoId}/chat`, {
    method: 'POST',
    body: { mensagem },
  });
}

export async function markPainelAlunoNotificationRead(notificationId) {
  return requestPlatformApi('/v1/notifications/read', {
    method: 'POST',
    body: { notification_id: notificationId },
  });
}

export async function markPainelAlunoNotificationsReadBatch(notificationIds) {
  return requestPlatformApi('/v1/aluno/notificacoes/read-batch', {
    method: 'POST',
    body: { notification_ids: notificationIds },
  });
}

export async function savePainelAlunoChallenge({ desafio, xpBonus, concluidoEm = null }) {
  return requestPlatformApi('/v1/aluno/preferencias/desafio', {
    method: 'POST',
    body: { desafio, xpBonus, concluidoEm },
  });
}

export async function savePainelAlunoReview({ livroId, nota, resenha }) {
  return requestPlatformApi('/v1/aluno/avaliacoes', {
    method: 'POST',
    body: { livroId, nota, resenha },
  });
}

export async function submitPainelAlunoActivity({ atividadeId, textoEntrega, status, enviadoEm }) {
  return requestPlatformApi('/v1/aluno/atividades/entregas', {
    method: 'POST',
    body: { atividadeId, textoEntrega, status, enviadoEm },
  });
}

export async function deletePainelAlunoActivitiesBatch({ atividadeIds }) {
  return requestPlatformApi('/v1/aluno/atividades/entregas/delete-batch', {
    method: 'POST',
    body: { atividadeIds },
  });
}

export async function createPainelAlunoAudiobook(payload) {
  return requestPlatformApi('/v1/aluno/audiobooks', {
    method: 'POST',
    body: payload,
  });
}

export async function togglePainelAlunoAudiobook({ audiobookId, enabled }) {
  return requestPlatformApi('/v1/aluno/meus-audiobooks/toggle', {
    method: 'POST',
    body: { audiobookId, enabled },
  });
}

export async function createPainelAlunoLabCreation(payload) {
  return requestPlatformApi('/v1/aluno/laboratorio/criacoes', {
    method: 'POST',
    body: payload,
  });
}

export async function updatePainelAlunoLabCreation(id, payload) {
  return requestPlatformApi(`/v1/aluno/laboratorio/criacoes/${id}`, {
    method: 'PATCH',
    body: payload,
  });
}

export async function deletePainelAlunoLabCreation({ id, comunidadePostId }) {
  return requestPlatformApi(`/v1/aluno/laboratorio/criacoes/${id}/delete`, {
    method: 'POST',
    body: { comunidadePostId },
  });
}
