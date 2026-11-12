const normalizar = (valor) => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

/** Ordena candidatos disponíveis usando interesses e histórico do próprio leitor. */
export function classificarLivros(livros, emprestimos = [], generos = [], excluidos = []) {
  const preferencias = new Set(generos.map(normalizar).filter(Boolean));
  const idsExcluidos = new Set(excluidos.map(String));
  const historico = new Map();
  const areas = new Map();
  for (const emprestimo of emprestimos) {
    const id = String(emprestimo.livro_id || '');
    if (id) historico.set(id, emprestimo);
    const area = normalizar(emprestimo.livros?.area);
    if (area) areas.set(area, (areas.get(area) || 0) + 1);
    if (id && emprestimo.status === 'ativo' && !emprestimo.data_devolucao_real) idsExcluidos.add(id);
  }
  return livros
    .filter((livro) => livro?.id && livro.disponivel && !idsExcluidos.has(String(livro.id)))
    .map((livro) => {
      const area = normalizar(livro.area);
      const pontuacao = (preferencias.has(area) && area ? 3 : 0) + (areas.get(area) || 0) * 2 + (historico.has(String(livro.id)) ? 0 : 1);
      return { livro, pontuacao };
    })
    .sort((a, b) => b.pontuacao - a.pontuacao || String(a.livro.titulo || '').localeCompare(String(b.livro.titulo || ''), 'pt-BR'));
}
