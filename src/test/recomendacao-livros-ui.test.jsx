import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecomendacaoLivros } from '@/components/RecomendacaoLivros';
import { fetchRecomendacaoLivros, proximaRecomendacaoLivros, salvarPreferenciasLivros } from '@/services/recomendacaoLivrosService';

vi.mock('@/services/recomendacaoLivrosService', () => ({
  fetchRecomendacaoLivros: vi.fn(),
  proximaRecomendacaoLivros: vi.fn(),
  salvarPreferenciasLivros: vi.fn(),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const resposta = { principal: { livro_id: '1', titulo: 'Livro', motivo: 'Seu gosto' }, restantes_hoje: 3, precisa_preferencias: false, generos_catalogo: ['Ficção', 'Fantasia', 'Terror', 'Romance'] };

beforeEach(() => { vi.clearAllMocks(); fetchRecomendacaoLivros.mockResolvedValue(resposta); });
afterEach(cleanup);

describe('RecomendacaoLivros', () => {
  it('abre preferências, limita a três gêneros e salva', async () => {
    fetchRecomendacaoLivros.mockResolvedValueOnce({ ...resposta, precisa_preferencias: true });
    salvarPreferenciasLivros.mockResolvedValue({});
    render(<RecomendacaoLivros />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ficção' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fantasia' }));
    fireEvent.click(screen.getByRole('button', { name: 'Terror' }));
    expect(screen.getByRole('button', { name: 'Romance' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e ver sugestão' }));
    await waitFor(() => expect(salvarPreferenciasLivros).toHaveBeenCalledWith(['Ficção', 'Fantasia', 'Terror']));
    await waitFor(() => expect(fetchRecomendacaoLivros).toHaveBeenCalledTimes(2));
  });

  it('desabilita o limite esgotado e abre o livro selecionado', async () => {
    fetchRecomendacaoLivros.mockResolvedValue({ ...resposta, restantes_hoje: 0 });
    const selecionar = vi.fn();
    render(<RecomendacaoLivros onSelecionar={selecionar} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Livro' }));
    expect(selecionar).toHaveBeenCalledWith(resposta.principal);
    expect(screen.getByRole('button', { name: /Sugerir outro/ })).toBeDisabled();
    expect(screen.getByText('Volte amanhã')).toBeInTheDocument();
  });

  it('oferece botão para pedir o livro recomendado', async () => {
    const selecionar = vi.fn();
    render(<RecomendacaoLivros onSelecionar={selecionar} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pedir emprestado' }));
    expect(selecionar).toHaveBeenCalledWith(resposta.principal);
  });

  it('trata 429 e permite tentar novamente após erro inicial', async () => {
    fetchRecomendacaoLivros.mockRejectedValueOnce(new Error('rede'));
    proximaRecomendacaoLivros.mockRejectedValue({ status: 429 });
    render(<RecomendacaoLivros />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));
    fireEvent.click(await screen.findByRole('button', { name: /Sugerir outro/ }));
    expect(await screen.findByText('Volte amanhã')).toBeInTheDocument();
  });

  it('informa esgotamento de candidatos sem consumir o limite', async () => {
    proximaRecomendacaoLivros.mockResolvedValue({ ...resposta, restantes_hoje: 2, sem_alternativas: true });
    render(<RecomendacaoLivros />);
    fireEvent.click(await screen.findByRole('button', { name: /Sugerir outro/ }));
    expect(await screen.findByText('Não há mais sugestões disponíveis hoje.')).toBeInTheDocument();
    expect(screen.getByText('Livro')).toBeInTheDocument();
    expect(screen.getByText('2 de 3 hoje')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sugerir outro/ })).toBeDisabled();
  });
});
