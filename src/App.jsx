import { Suspense, lazy } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider } from '@/hooks/useAuth';
import { TenantProvider, useTenant } from '@/hooks/useTenant';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { SuperAdminRoute } from '@/components/SuperAdminRoute';
import { ThemeProvider } from '@/components/theme-provider';

import { PrivateTelemetryTracker } from '@/components/PrivateTelemetryTracker';
import { SystemLogObserver } from '@/components/SystemLogObserver';
import { AppShellState } from '@/components/AppShellState';
import { ConnectivityStatus } from '@/components/ConnectivityStatus';
import { NativePushBridge } from '@/components/NativePushBridge';

const Auth = lazy(() => import('./pages/Auth'));
const Privacidade = lazy(() => import('./pages/Privacidade'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Livros = lazy(() => import('./pages/Livros.jsx'));
const Usuarios = lazy(() => import('./pages/Usuarios.jsx'));
const Emprestimos = lazy(() => import('./pages/Emprestimos'));
const Relatorios = lazy(() => import('./pages/Relatorios.jsx'));
const NotFound = lazy(() => import('./pages/NotFound'));
const TenantNotFound = lazy(() => import('./pages/TenantNotFound'));
const GerenciarTokens = lazy(() => import('./pages/GerenciarTokens.jsx'));
const Convite = lazy(() => import('./pages/Convite'));
const ConfiguracaoEscola = lazy(() => import('./pages/ConfiguracaoEscola.jsx'));
const AdminTenants = lazy(() => import('./pages/AdminTenants'));
const SuperAdmins = lazy(() => import('./pages/SuperAdmins'));
const AdminAcesso = lazy(() => import('./pages/AdminAcesso'));
const OnboardingGestor = lazy(() => import('./pages/OnboardingGestor'));
const Configuracoes = lazy(() => import('./pages/Configuracoes'));
const Reclamacoes = lazy(() => import('./pages/Reclamacoes'));
const ComunidadeAluno = lazy(() => import('./pages/aluno/ComunidadeAluno'));
const Comunicados = lazy(() => import('./pages/Comunicados'));
const ArquivosAula = lazy(() => import('./pages/ArquivosAula'));
const MeusAlunos = lazy(() => import('./pages/professor/MeusAlunos'));
const PainelProfessor = lazy(() => import('./pages/professor/PainelProfessor'));
const RelatoriosLeitura = lazy(() => import('./pages/professor/RelatoriosLeitura'));
const PainelAluno = lazy(() => import('./pages/aluno/PainelAluno'));
const RankingAluno = lazy(() => import('./pages/aluno/RankingAluno'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function isLegacyDisabledHost() {
  if (typeof window === 'undefined') return false;
  return String(window.location.hostname || '').toLowerCase() === 'bibliotec-ai-core.vercel.app';
}

function LegacyHostShutdownNotice() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-2xl rounded-3xl border border-destructive/35 bg-card/95 p-8 text-center shadow-[0_20px_50px_hsl(var(--destructive)/0.12)] backdrop-blur-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-destructive/80">Host desativado</p>
        <h1 className="mt-4 text-3xl font-black tracking-tight text-destructive sm:text-4xl">
          APLICACAO FORA DO AR PERMANENTEMENTE
        </h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">
          Contate rapidamente o responsavel mais proximo.
        </p>
      </div>
    </div>
  );
}

function AppRoutes() {
  if (isLegacyDisabledHost()) {
    return <LegacyHostShutdownNotice />;
  }

  const { loading, isTenantHost, tenant, error } = useTenant();

  if (loading) {
    return (
      <AppShellState
        title="Preparando seu ambiente"
        description="Estamos identificando o tenant e carregando configurações iniciais."
      />
    );
  }

  if (isTenantHost && !tenant) {
    return <TenantNotFound error={error} />;
  }

  return (
    <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route path="/privacidade" element={<Privacidade />} />
      <Route path="/admin/acesso" element={<AdminAcesso />} />
      <Route path="/admin/login" element={<Navigate to="/admin/acesso" replace />} />
      <Route path="/acesso-admin" element={<Navigate to="/admin/acesso" replace />} />
      <Route path="/convite/:token" element={<Convite />} />
      <Route path="/onboarding/:token" element={<OnboardingGestor />} />
      <Route
        path="/reclamacoes"
        element={(
          <ProtectedRoute>
            <Reclamacoes />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/comunidade"
        element={(
          <ProtectedRoute>
            <ComunidadeAluno />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/comunicados"
        element={(
          <ProtectedRoute>
            <Comunicados />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/arquivos-de-aula"
        element={(
          <ProtectedRoute>
            <ArquivosAula />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/ranking"
        element={(
          <ProtectedRoute>
            <RankingAluno />
          </ProtectedRoute>
        )}
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route
        path="/admin"
        element={<Navigate to="/admin/tenants" replace />}
      />

      <Route
        path="/admin/tenants"
        element={
          <ProtectedRoute>
            <SuperAdminRoute>
              <AdminTenants />
            </SuperAdminRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/super-admins"
        element={
          <ProtectedRoute>
            <SuperAdminRoute>
              <SuperAdmins />
            </SuperAdminRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/livros"
        element={
          <ProtectedRoute>
            <Livros />
          </ProtectedRoute>
        }
      />
      <Route
        path="/usuarios"
        element={
          <ProtectedRoute>
            <Usuarios />
          </ProtectedRoute>
        }
      />
      <Route
        path="/emprestimos"
        element={
          <ProtectedRoute>
            <Emprestimos />
          </ProtectedRoute>
        }
      />
      <Route
        path="/relatorios"
        element={
          <ProtectedRoute>
            <Relatorios />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tokens"
        element={
          <ProtectedRoute>
            <GerenciarTokens />
          </ProtectedRoute>
        }
      />
      <Route
        path="/configuracao-escola"
        element={
          <ProtectedRoute>
            <ConfiguracaoEscola />
          </ProtectedRoute>
        }
      />
      <Route
        path="/configuracoes"
        element={
          <ProtectedRoute>
            <Configuracoes />
          </ProtectedRoute>
        }
      />
      <Route
        path="/professor/alunos"
        element={
          <ProtectedRoute>
            <MeusAlunos />
          </ProtectedRoute>
        }
      />
      <Route
        path="/professor/painel"
        element={
          <ProtectedRoute>
            <PainelProfessor />
          </ProtectedRoute>
        }
      />
      <Route
        path="/professor/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/professor/relatorios"
        element={
          <ProtectedRoute>
            <RelatoriosLeitura />
          </ProtectedRoute>
        }
      />
      <Route
        path="/professor"
        element={(
          <ProtectedRoute>
            <Navigate to="/professor/dashboard" replace />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/professor/atividades"
        element={(
          <ProtectedRoute>
            <Navigate to="/professor/painel" replace />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/aluno/painel"
        element={
          <ProtectedRoute>
            <Navigate to="/aluno/perfil" replace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/aluno"
        element={(
          <ProtectedRoute>
            <Navigate to="/aluno/perfil" replace />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/aluno/perfil"
        element={
          <ProtectedRoute>
            <PainelAluno />
          </ProtectedRoute>
        }
      />
      <Route
        path="/aluno/biblioteca"
        element={
          <ProtectedRoute>
            <PainelAluno />
          </ProtectedRoute>
        }
      />
      <Route
        path="/aluno/laboratorio"
        element={
          <ProtectedRoute>
            <PainelAluno />
          </ProtectedRoute>
        }
      />
      <Route
        path="/aluno/atividades"
        element={
          <ProtectedRoute>
            <PainelAluno />
          </ProtectedRoute>
        }
      />
      <Route
        path="/aluno/comunidade"
        element={
          <ProtectedRoute>
            <ComunidadeAluno />
          </ProtectedRoute>
        }
      />
      <Route
        path="/aluno/comunicados"
        element={
          <ProtectedRoute>
            <Comunicados />
          </ProtectedRoute>
        }
      />
      <Route
        path="/aluno/arquivos-de-aula"
        element={
          <ProtectedRoute>
            <ArquivosAula />
          </ProtectedRoute>
        }
      />
      <Route
        path="/aluno/ranking"
        element={
          <ProtectedRoute>
            <RankingAluno />
          </ProtectedRoute>
        }
      />
      <Route
        path="/gestão"
        element={(
          <ProtectedRoute>
            <Navigate to="/dashboard" replace />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/gestor"
        element={(
          <ProtectedRoute>
            <Navigate to="/dashboard" replace />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/bibliotecaria"
        element={(
          <ProtectedRoute>
            <Navigate to="/dashboard" replace />
          </ProtectedRoute>
        )}
      />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TenantProvider>
        <AuthProvider>
          <div translate="no" className="notranslate">
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <ConnectivityStatus />
              <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <PrivateTelemetryTracker />
                <SystemLogObserver />
                <NativePushBridge />
                <Suspense
                  fallback={(
                    <AppShellState
                      title="Carregando módulo"
                      description="Aguarde enquanto abrimos a próxima tela."
                    />
                  )}
                >
                  <AppRoutes />
                </Suspense>
              </BrowserRouter>
            </TooltipProvider>
          </div>
        </AuthProvider>
      </TenantProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;

