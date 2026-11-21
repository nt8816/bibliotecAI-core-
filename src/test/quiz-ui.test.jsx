import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AdminQuiz from '@/pages/AdminQuiz';
import { projectQuizRanking } from '@/lib/quizRanking';
import { requestPlatformApi } from '@/lib/platformApi';
import { getPlatformPasskeyAssertion } from '@/lib/webauthn';

vi.mock('@/lib/platformApi', () => ({ requestPlatformApi: vi.fn() }));
vi.mock('@/lib/webauthn', () => ({ getPlatformPasskeyAssertion: vi.fn() }));
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

it('mostra falta de permissão sem solicitar passkey', async () => {
  requestPlatformApi.mockRejectedValue({ status: 403 });
  show();
  expect(await screen.findByRole('alert')).toHaveTextContent('Você não tem permissão');
  expect(screen.queryByRole('button', { name: /passkey/i })).not.toBeInTheDocument();
});

it('a projeção armazenada no telão exclui apelidos e campos extras', () => {
  const rows = [{ nickname: 'privado@example.com', xp: 10, correct_count: 2, elapsed_ms: 123, email: 'outro@example.com' }];
  expect(projectQuizRanking(rows, true)).toEqual([{ xp: 10, correct_count: 2, elapsed_ms: 123 }]);
  expect(projectQuizRanking(rows, false)).toEqual(rows);
});

it('telão anonimiza apelidos e nunca consulta contatos', async () => {
  requestPlatformApi.mockImplementation(mockData);
  show(true);
  fireEvent.click(await screen.findByRole('button', { name: /Rodada A/ }));
  expect(await screen.findByText(/Participante 1/)).toBeInTheDocument();
  expect(screen.queryByText(/privado@example.com/)).not.toBeInTheDocument();
  expect(requestPlatformApi.mock.calls.some(([path]) => path.includes('/contacts'))).toBe(false);
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


