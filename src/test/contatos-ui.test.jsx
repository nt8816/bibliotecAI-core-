import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ContactForm } from '@/pages/LandingPage';
import AdminContatos from '@/pages/AdminContatos';
import { requestPlatformApi } from '@/lib/platformApi';
import { trackForm } from '@/hooks/useAnalytics';

vi.mock('@/lib/platformApi', () => ({ requestPlatformApi: vi.fn() }));
vi.mock('@/hooks/useAnalytics', () => ({ trackClick: vi.fn(), trackSection: vi.fn(), trackForm: vi.fn() }));
vi.mock('@/components/layout/MainLayout', () => ({ MainLayout: ({ children }) => <div>{children}</div> }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it('envia os campos sem dados pessoais em analytics e confirma somente após sucesso', async () => {
  let resolve;
  requestPlatformApi.mockReturnValue(new Promise((r) => { resolve = r; }));
  render(<ContactForm />);
  fireEvent.change(screen.getByLabelText('Seu nome'), { target: { value: 'Ana' } });
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@example.com' } });
  fireEvent.change(screen.getByLabelText(/Escola ou instituição/), { target: { value: 'Escola' } });
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Duvidas' } });
  fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Olá' } });
  fireEvent.click(screen.getByRole('button', { name: /Enviar mensagem/ }));
  expect(requestPlatformApi).toHaveBeenCalledWith('/v1/contato', { method: 'POST', auth: false, body: { nome: 'Ana', email: 'ana@example.com', escola: 'Escola', assunto: 'Duvidas', mensagem: 'Olá' } });
  expect(screen.queryByText('Mensagem enviada!')).not.toBeInTheDocument();
  resolve({});
  expect(await screen.findByText('Mensagem enviada!')).toBeInTheDocument();
  expect(trackForm).toHaveBeenCalledWith('submit');
});

it('exibe erro e mantém os campos ao falhar', async () => {
  requestPlatformApi.mockRejectedValue(new Error('Falha no envio'));
  render(<ContactForm />);
  fireEvent.change(screen.getByLabelText('Seu nome'), { target: { value: 'Ana' } });
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@example.com' } });
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Duvidas' } });
  fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Olá' } });
  fireEvent.click(screen.getByRole('button', { name: /Enviar mensagem/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Falha no envio');
  expect(screen.getByLabelText('Seu nome')).toHaveValue('Ana');
  expect(screen.getByLabelText('Mensagem')).toHaveValue('Olá');
  expect(trackForm).not.toHaveBeenCalledWith('submit');
});

it('lista contatos autenticados e permite tentar novamente após erro', async () => {
  requestPlatformApi.mockRejectedValueOnce(new Error('Indisponível')).mockResolvedValueOnce({ data: [{ id: '1', nome: 'Ana', email: 'ana@example.com', escola: 'Escola', assunto: 'Duvidas', mensagem: 'Olá', created_at: '2026-01-01T12:00:00Z', email_status: 'enviado' }] });
  render(<AdminContatos />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Indisponível');
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(await screen.findByText('Ana')).toBeInTheDocument();
  expect(screen.getByText(/ana@example.com/)).toBeInTheDocument();
  expect(screen.getByText(/enviado/)).toBeInTheDocument();
  await waitFor(() => expect(requestPlatformApi).toHaveBeenCalledWith('/v1/admin/contatos', { auth: true }));
});
