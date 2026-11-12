import { describe, expect, it } from 'vitest';
import { classificarLivros } from '@/lib/recomendacaoLivros';

describe('classificação de recomendações', () => {
  it('prioriza a área preferida e remove livros indisponíveis ou ativos', () => {
    const livros = [
      { id: '1', titulo: 'A', area: 'Ficção', disponivel: true },
      { id: '2', titulo: 'B', area: 'História', disponivel: true },
      { id: '3', titulo: 'C', area: 'Ficção', disponivel: false },
      { id: '4', titulo: 'D', area: 'Ficção', disponivel: true },
    ];
    const resultado = classificarLivros(livros, [{ livro_id: '4', status: 'ativo' }], ['ficcao']);
    expect(resultado.map(({ livro }) => livro.id)).toEqual(['1', '2']);
  });

  it('considera o histórico e exclui sugestões já apresentadas', () => {
    const livros = [
      { id: '1', titulo: 'A', area: 'História', disponivel: true },
      { id: '2', titulo: 'B', area: 'Fantasia', disponivel: true },
      { id: '3', titulo: 'C', area: 'Fantasia', disponivel: true },
    ];
    const resultado = classificarLivros(livros, [{ livro_id: 'antigo', status: 'devolvido', livros: { area: 'Fantasia' } }], [], ['3']);
    expect(resultado.map(({ livro }) => livro.id)).toEqual(['2', '1']);
  });
});
