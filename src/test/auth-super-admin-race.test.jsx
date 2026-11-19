import { act, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { fetchPlatformSessionProfile, signOutWithPlatform } from '@/services/authService';
import { clearPlatformSession, getPlatformSession } from '@/lib/platformSession';

vi.mock('@/lib/platformSession', () => ({
  addPlatformSessionListener: vi.fn(() => () => {}),
  clearPlatformSession: vi.fn(),
  getPlatformSession: vi.fn(),
}));
vi.mock('@/services/authService', () => ({
  consumeTenantSessionHandoff: vi.fn().mockResolvedValue(null),
  fetchPlatformSessionProfile: vi.fn(),
  signInWithPlatform: vi.fn(),
  signOutWithPlatform: vi.fn(),
  signUpWithPlatform: vi.fn(),
}));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
let auth;
function Probe() { auth = useAuth(); return <p>{auth.userRole || 'sem perfil'}</p>; }
const session = { access_token: 'token', refresh_token: 'refresh', user: { id: 'admin' } };
beforeEach(() => { vi.clearAllMocks(); getPlatformSession.mockReturnValue(session); });
afterEach(cleanup);

it('não troca o superadmin pelo aluno quando a consulta antiga termina depois do login reforçado', async () => {
  const pending = deferred(); fetchPlatformSessionProfile.mockReturnValue(pending.promise);
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(fetchPlatformSessionProfile).toHaveBeenCalled());
  act(() => auth.applySuperAdminSession({ session }));
  expect(screen.getByText('super_admin')).toBeInTheDocument();
  await act(async () => pending.resolve({ user: session.user, roles: ['aluno'] }));
  expect(screen.getByText('super_admin')).toBeInTheDocument();
});

it('não limpa a sessão de superadmin se uma consulta anterior falhar', async () => {
  const pending = deferred(); fetchPlatformSessionProfile.mockReturnValue(pending.promise);
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(fetchPlatformSessionProfile).toHaveBeenCalled());
  act(() => auth.applySuperAdminSession({ session }));
  await act(async () => pending.reject(new Error('erro antigo')));
  expect(clearPlatformSession).not.toHaveBeenCalled();
  expect(screen.getByText('super_admin')).toBeInTheDocument();
});

it('não restaura um perfil após sair enquanto a consulta está pendente', async () => {
  const pending = deferred(); fetchPlatformSessionProfile.mockReturnValue(pending.promise);
  signOutWithPlatform.mockResolvedValue();
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(fetchPlatformSessionProfile).toHaveBeenCalled());
  await act(async () => auth.signOut());
  await act(async () => pending.resolve({ user: session.user, roles: ['aluno'] }));
  expect(auth.user).toBeNull();
  expect(screen.getByText('sem perfil')).toBeInTheDocument();
});

it('solicita nova confirmação quando o servidor recusa a sessão administrativa', async () => {
  window.sessionStorage.removeItem('bibliotecai.auth.notice');
  fetchPlatformSessionProfile.mockRejectedValue({ payload: { requires_super_admin_security: true } });
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(clearPlatformSession).toHaveBeenCalled());
  expect(window.sessionStorage.getItem('bibliotecai.auth.notice')).toMatch(/superadministrador/);
  expect(auth.user).toBeNull();
});

it('não transforma metadados editáveis em perfil administrativo quando o servidor retorna lista vazia', async () => {
  fetchPlatformSessionProfile.mockResolvedValue({ user: { id: 'normal', user_metadata: { roles: ['super_admin'] } }, roles: [] });
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(auth.loading).toBe(false));
  expect(auth.isSuperAdmin).toBe(false);
  expect(auth.roles).toEqual([]);
});
