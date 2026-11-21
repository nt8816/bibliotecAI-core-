import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AdminQuiz from '@/pages/AdminQuiz';
import { projectQuizRanking } from '@/lib/quizRanking';
import { requestPlatformApi } from '@/lib/platformApi';

vi.mock('@/lib/platformApi', () => ({ requestPlatformApi: vi.fn() }));
vi.mock('@/components/layout/MainLayout', () => ({ MainLayout: ({ children }) => <div>{children}</div> }));
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
const show = (telao = false) => render(<MemoryRouter><AdminQuiz telao={telao} /></MemoryRouter>);
const round = '12345678-1234-1234-1234-123456789abc';
const mockData = path => {
  if (path.endsWith('/session')) return Promise.resolve({ success: true });
  if (path.includes('/rounds')) return Promise.resolve({ success: true, data: [{ id: round, name: 'Rodada A', active: true }] });
  if (path.includes('/leaderboard')) return Promise.resolve({ success: true, data: [{ nickname: 'privado@example.com', xp: 10, correct_count: 2, elapsed_ms: 123 }] });
  if (path.includes('/contacts')) return Promise.resolve({ success: true, data: [{ game_id: '1', nickname: 'Pessoa', email: 'privado@example.com', phone: '123', selected_winner: true }] });
  throw new Error('unexpected');
};

it('falha fechada quando o serviço está indisponível', async () => {
  requestPlatformApi.mockRejectedValue(Object.assign(new Error('detalhes privados'), { status: 503 }));
  show();
  expect(await screen.findByRole('alert')).toHaveTextContent('Serviço do quiz indisponível');
  expect(screen.queryByText('detalhes privados')).not.toBeInTheDocument();
});

it('a projeção do telão preserva nomes e exclui campos extras', () => {
  const rows = [{ nickname: 'privado@example.com', xp: 10, correct_count: 2, elapsed_ms: 123, email: 'outro@example.com' }];
  expect(projectQuizRanking(rows, true)).toEqual([{ nickname: 'privado@example.com', xp: 10, correct_count: 2, elapsed_ms: 123 }]);
  expect(projectQuizRanking(rows, false)).toEqual(rows);
});

it('telão mostra nomes e nunca consulta contatos', async () => {
  requestPlatformApi.mockImplementation(mockData);
  show(true);
  fireEvent.click(await screen.findByRole('button', { name: /Rodada A/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar apresentação' }));
  expect(await screen.findByText('privado@example.com')).toBeInTheDocument();
  expect(screen.queryByText('Escolha a rodada')).not.toBeInTheDocument();
  expect(screen.queryByText('Voltar ao painel')).not.toBeInTheDocument();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.getByText('Escolha a rodada')).toBeInTheDocument();
  expect(screen.queryByText(/privado@example.com/)).not.toBeInTheDocument();
  expect(requestPlatformApi.mock.calls.some(([path]) => path.includes('/contacts'))).toBe(false);
});

it('mostra todos os participantes da página em cartões separados', async () => {
  requestPlatformApi.mockImplementation(path => path.includes('/leaderboard')
    ? Promise.resolve({ success: true, data: [
      { nickname: 'Ana', xp: 50, correct_count: 5, elapsed_ms: 1000 },
      { nickname: 'Bruno', xp: 30, correct_count: 3, elapsed_ms: 2000 },
    ] })
    : mockData(path));
  show();
  fireEvent.click(await screen.findByRole('button', { name: /Rodada A/ }));
  const ana = (await screen.findByText('Ana')).closest('li');
  const bruno = screen.getByText('Bruno').closest('li');
  expect(ana).toHaveTextContent('1º');
  expect(ana).toHaveTextContent('50 XP');
  expect(bruno).toHaveTextContent('2º');
  expect(bruno).toHaveTextContent('30 XP');
  expect(ana).not.toBe(bruno);
});

it('painel consulta contatos apenas sob demanda e limpa ao expirar', async () => {
  requestPlatformApi.mockImplementation(mockData);
  show();
  fireEvent.click(await screen.findByRole('button', { name: /Rodada A/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Consultar contatos' }));
  expect(await screen.findByText(/E-mail: privado@example.com/)).toBeInTheDocument();
  expect(screen.getByText(/Selecionado para conferência/)).toBeInTheDocument();
  expect(requestPlatformApi.mock.calls.some(([path]) => path.includes(`/contacts?round_id=${round}`))).toBe(true);
  act(() => window.dispatchEvent(new CustomEvent('bibliotecai:platform-session-changed', { detail: { session: null } })));
  await waitFor(() => expect(screen.queryByText(/E-mail: privado@example.com/)).not.toBeInTheDocument());
  expect(screen.getByRole('alert')).toHaveTextContent('Sessão expirada');
});


it('mantém o painel aberto quando a sessão é renovada', async () => {
  requestPlatformApi.mockImplementation(mockData);
  show();
  expect(await screen.findByText('Acesso ao quiz confirmado.')).toBeInTheDocument();
  act(() => window.dispatchEvent(new CustomEvent('bibliotecai:platform-session-changed', { detail: { session: { access_token: 'renovado' } } })));
  expect(screen.getByText('Acesso ao quiz confirmado.')).toBeInTheDocument();
  expect(requestPlatformApi).toHaveBeenCalledWith('/v1/admin/quiz/session', expect.not.objectContaining({ retryOnUnauthorized: false }));
});
