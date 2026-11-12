import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CapaLivro } from '@/components/CapaLivro';
import { buscarCapaLivro } from '@/services/capasOpenLibraryService';

vi.mock('@/services/capasOpenLibraryService', () => ({ buscarCapaLivro: vi.fn() }));
const livro = { titulo: 'O Cortiço', autor: 'Aluísio Azevedo', editora: 'Ática', ano: 2000 };

beforeEach(() => { vi.clearAllMocks(); buscarCapaLivro.mockResolvedValue(null); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('CapaLivro', () => {
  it('aguarda o cartão ficar visível antes de buscar', async () => {
    let observar;
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback) { observar = callback; }
      observe() {}
      disconnect() {}
    });
    buscarCapaLivro.mockResolvedValue('https://covers.openlibrary.org/b/id/123-M.jpg');
    render(<CapaLivro livro={livro} />);
    expect(buscarCapaLivro).not.toHaveBeenCalled();
    act(() => observar([{ isIntersecting: true }]));
    expect(await screen.findByRole('img', { name: 'Capa de O Cortiço' })).toHaveAttribute('src', 'https://covers.openlibrary.org/b/id/123-M.jpg');
    expect(buscarCapaLivro).toHaveBeenCalledWith(livro);
  });

  it('preserva capa existente e mostra alternativa se a imagem falhar', async () => {
    render(<CapaLivro livro={{ ...livro, capa_url: 'https://example.org/capa.jpg' }} />);
    const imagem = await screen.findByRole('img', { name: 'Capa de O Cortiço' });
    expect(buscarCapaLivro).not.toHaveBeenCalled();
    fireEvent.error(imagem);
    expect(screen.getByRole('img', { name: 'Capa indisponível' })).toBeInTheDocument();
  });

  it('mantém alternativa quando a consulta falha', async () => {
    buscarCapaLivro.mockRejectedValue(new Error('rede'));
    render(<CapaLivro livro={livro} />);
    await waitFor(() => expect(buscarCapaLivro).toHaveBeenCalled());
    expect(screen.getByRole('img', { name: 'Capa indisponível' })).toBeInTheDocument();
  });
});
