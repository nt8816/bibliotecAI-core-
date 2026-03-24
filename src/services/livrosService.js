import { requestPlatformApi } from '@/lib/platformApi';

export async function fetchLivrosCatalogo({ preCategorias, canonicalizeBookArea, defaultPreCategories }) {
  const payload = await requestPlatformApi('/v1/livros');
  const activeLoanBookIds = new Set(
    (Array.isArray(payload?.activeLoanBookIds) ? payload.activeLoanBookIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  );
  const categoriasBase = Array.isArray(payload?.preCategorias) && payload.preCategorias.length > 0
    ? payload.preCategorias
    : defaultPreCategories;

  return {
    escolaId: payload?.escolaId || null,
    livros: (Array.isArray(payload?.livros) ? payload.livros : []).map((livro) => ({
      ...livro,
      area: canonicalizeBookArea(livro?.area, preCategorias),
      isEmprestado: activeLoanBookIds.has(String(livro?.id || '').trim()),
    })),
    preCategorias: categoriasBase.map((nome) => canonicalizeBookArea(nome)),
  };
}

export async function createLivroCategoria(payload) {
  return requestPlatformApi('/v1/livros/categorias', { method: 'POST', body: payload });
}

export async function deleteLivroCategoria(escolaId, nome) {
  return requestPlatformApi('/v1/livros/categorias/delete', {
    method: 'POST',
    body: { escola_id: escolaId, nome },
  });
}

export async function saveLivro(payload, editingLivroId) {
  return editingLivroId
    ? requestPlatformApi(`/v1/livros/${editingLivroId}`, { method: 'PATCH', body: payload })
    : requestPlatformApi('/v1/livros', { method: 'POST', body: payload });
}

export async function deleteLivro(id) {
  return requestPlatformApi(`/v1/livros/${id}/delete`, { method: 'POST' });
}

export async function importLivrosBatch(livros, escolaId) {
  const payload = await requestPlatformApi('/v1/livros/import', {
    method: 'POST',
    body: { livros, escola_id: escolaId },
  });
  return {
    livros: Array.isArray(payload?.livros) ? payload.livros : [],
  };
}
