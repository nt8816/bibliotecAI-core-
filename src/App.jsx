import { Suspense, lazy, useState } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider } from '@/hooks/useAuth';
import { TenantProvider, useTenant } from '@/hooks/useTenant';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { RoleProtectedRoute } from '@/components/RoleProtectedRoute';
import { SuperAdminRoute } from '@/components/SuperAdminRoute';
import { ThemeProvider } from '@/components/theme-provider';

import { PrivateTelemetryTracker } from '@/components/PrivateTelemetryTracker';
import { SystemLogObserver } from '@/components/SystemLogObserver';
import { AppShellState } from '@/components/AppShellState';
import { ConnectivityStatus } from '@/components/ConnectivityStatus';
import { NativePushBridge } from '@/components/NativePushBridge';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const Auth = lazy(() => import('./pages/Auth'));
const Privacidade = lazy(() => import('./pages/Privacidade'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Livros = lazy(() => import('./pages/Livros.jsx'));
const Usuarios = lazy(() => import('./pages/Usuarios.jsx'));
const Emprestimos = lazy(() => import('./pages/Emprestimos'));
const MensagensBiblioteca = lazy(() => import('./pages/MensagensBiblioteca'));
const Relatorios = lazy(() => import('./pages/Relatorios.jsx'));
const NotFound = lazy(() => import('./pages/NotFound'));
const TenantNotFound = lazy(() => import('./pages/TenantNotFound'));
const GerenciarTokens = lazy(() => import('./pages/GerenciarTokens.jsx'));
const Convite = lazy(() => import('./pages/Convite'));
const ConfiguracaoEscola = lazy(() => import('./pages/ConfiguracaoEscola.jsx'));
const AdminTenants = lazy(() => import('./pages/AdminTenants'));
const SuperAdmins = lazy(() => import('./pages/SuperAdmins'));
const AnalyticsAdmin = lazy(() => import('./pages/AnalyticsAdmin'));
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

function AppRoutes() {
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
      <Route path="/" element={<LandingPage />} />
      <Route path="/landing" element={<LandingPage />} />
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
          <RoleProtectedRoute allowedRoles={['professor', 'gestor', 'bibliotecaria']}>
            <ComunidadeAluno />
          </RoleProtectedRoute>
        )}
      />
      <Route
        path="/comunicados"
        element={(
          <RoleProtectedRoute allowedRoles={['professor', 'gestor', 'bibliotecaria', 'aluno']}>
            <Comunicados />
          </RoleProtectedRoute>
        )}
      />
      <Route
        path="/arquivos-de-aula"
        element={(
          <RoleProtectedRoute allowedRoles={['professor', 'gestor']}>
            <ArquivosAula />
          </RoleProtectedRoute>
        )}
      />
      <Route
        path="/ranking"
        element={(
          <RoleProtectedRoute allowedRoles={['professor', 'gestor', 'bibliotecaria']}>
            <RankingAluno />
          </RoleProtectedRoute>
        )}
      />
      <Route
        path="/aluno"
        element={(
          <RoleProtectedRoute allowedRoles={['aluno']}>
            <Navigate to="/aluno/perfil" replace />
          </RoleProtectedRoute>
        )}
      />
      <Route
        path="/aluno/perfil"
        element={(
          <RoleProtectedRoute allowedRoles={['aluno']}>
            <PainelAluno />
          </RoleProtectedRoute>
        )}
      />
      <Route
        path="/aluno/biblioteca"
        element={(
          <RoleProtectedRoute allowedRoles={['aluno']}>
            <PainelAluno />
          </RoleProtectedRoute>
        )}
      />
      <Route
        path="/aluno/laboratorio"
        element={(
          <RoleProtectedRoute allowedRoles={['aluno']}>
            <PainelAluno />
          </RoleProtectedRoute>
        )}
      />
      <Route
        path="/aluno/atividades"
        element={(
          <RoleProtectedRoute allowedRoles={['aluno']}>
            <PainelAluno />
          </RoleProtectedRoute>
        )}
      />
      <Route
        path="/aluno/comunicados"
        element={(
          <RoleProtectedRoute allowedRoles={['aluno']}>
            <Comunicados />
          </RoleProtectedRoute>
        )}
      />
      <Route
        path="/aluno/mensagens"
        element={(
          <RoleProtectedRoute allowedRoles={['aluno']}>
            <MensagensBiblioteca />
          </RoleProtectedRoute>
        )}
      />
      <Route
        path="/aluno/comunidade"
        element={(
          <RoleProtectedRoute allowedRoles={['aluno']}>
            <ComunidadeAluno />
          </RoleProtectedRoute>
        )}
      />
      <Route
        path="/aluno/conversas"
        element={(
          <RoleProtectedRoute allowedRoles={['aluno']}>
            <Navigate to="/aluno/mensagens" replace />
          </RoleProtectedRoute>
        )}
      />
      <Route
        path="/aluno/arquivos-de-aula"
        element={(
          <RoleProtectedRoute allowedRoles={['aluno']}>
            <ArquivosAula />
          </RoleProtectedRoute>
        )}
      />
      <Route
        path="/aluno/ranking"
        element={(
          <RoleProtectedRoute allowedRoles={['aluno']}>
            <RankingAluno />
          </RoleProtectedRoute>
        )}
      />

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
        path="/analytics"
        element={
          <ProtectedRoute>
            <SuperAdminRoute>
              <AnalyticsAdmin />
            </SuperAdminRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard"
        element={
          <RoleProtectedRoute allowedRoles={['gestor', 'bibliotecaria', 'super_admin']}>
            <Dashboard />
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/livros"
        element={
          <RoleProtectedRoute allowedRoles={['professor', 'gestor', 'bibliotecaria']}>
            <Livros />
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/usuarios"
        element={
          <RoleProtectedRoute allowedRoles={['gestor', 'bibliotecaria']}>
            <Usuarios />
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/emprestimos"
        element={
          <RoleProtectedRoute allowedRoles={['gestor', 'bibliotecaria']}>
            <Emprestimos />
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/conversas"
        element={
          <RoleProtectedRoute allowedRoles={['bibliotecaria']}>
            <Navigate to="/mensagens" replace />
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/mensagens"
        element={
          <RoleProtectedRoute allowedRoles={['bibliotecaria']}>
            <MensagensBiblioteca />
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/relatorios"
        element={
          <RoleProtectedRoute allowedRoles={['gestor', 'bibliotecaria']}>
            <Relatorios />
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/tokens"
        element={
          <RoleProtectedRoute allowedRoles={['gestor']}>
            <GerenciarTokens />
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/configuracao-escola"
        element={
          <RoleProtectedRoute allowedRoles={['gestor']}>
            <ConfiguracaoEscola />
          </RoleProtectedRoute>
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
          <RoleProtectedRoute allowedRoles={['professor']}>
            <MeusAlunos />
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/professor/painel"
        element={
          <RoleProtectedRoute allowedRoles={['professor', 'gestor']}>
            <PainelProfessor />
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/gestor/atividades"
        element={
          <RoleProtectedRoute allowedRoles={['gestor']}>
            <PainelProfessor />
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/professor/dashboard"
        element={
          <RoleProtectedRoute allowedRoles={['professor']}>
            <Dashboard />
          </RoleProtectedRoute>
        }
      />
      <Route
        path="/professor/relatorios"
        element={
          <RoleProtectedRoute allowedRoles={['professor']}>
            <RelatoriosLeitura />
          </RoleProtectedRoute>
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
          <RoleProtectedRoute allowedRoles={['professor', 'gestor']}>
            <Navigate to="/professor/painel" replace />
          </RoleProtectedRoute>
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

const App = () => {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  }));

  return (
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
};

export default App;
