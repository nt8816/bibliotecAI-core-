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

const Auth = lazy(() => import('./pages/Auth'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Livros = lazy(() => import('./pages/Livros.jsx'));
const Usuarios = lazy(() => import('./pages/Usuarios.jsx'));
const Emprestimos = lazy(() => import('./pages/Emprestimos'));
const Relatorios = lazy(() => import('./pages/Relatorios.jsx'));
const NotFound = lazy(() => import('./pages/NotFound'));
const TenantNotFound = lazy(() => import('./pages/TenantNotFound'));
const GerenciarTokens = lazy(() => import('./pages/GerenciarTokens.jsx'));
const Convite = lazy(() => import('./pages/Convite'));
const ConfiguracaoEscola = lazy(() => import('./pages/ConfiguracaoEscola'));
const AdminTenants = lazy(() => import('./pages/AdminTenants'));
const AdminAcesso = lazy(() => import('./pages/AdminAcesso'));
const OnboardingGestor = lazy(() => import('./pages/OnboardingGestor'));
const Configuracoes = lazy(() => import('./pages/Configuracoes'));
const ComunidadeAluno = lazy(() => import('./pages/aluno/ComunidadeAluno'));
const MeusAlunos = lazy(() => import('./pages/professor/MeusAlunos'));
const PainelProfessor = lazy(() => import('./pages/professor/PainelProfessor'));
const RelatoriosLeitura = lazy(() => import('./pages/professor/RelatoriosLeitura'));
const PainelAluno = lazy(() => import('./pages/aluno/PainelAluno'));

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

function AppRoutes() {
  const { loading, isTenantHost, tenant, error } = useTenant();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando tenant...</div>;
  }

  if (isTenantHost && !tenant) {
    return <TenantNotFound error={error} />;
  }

  return (
    <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route path="/admin/acesso" element={<AdminAcesso />} />
      <Route path="/convite/:token" element={<Convite />} />
      <Route path="/onboarding/:token" element={<OnboardingGestor />} />
      <Route
        path="/comunidade"
        element={(
          <ProtectedRoute>
            <ComunidadeAluno />
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
        path="/aluno/painel"
        element={
          <ProtectedRoute>
            <Navigate to="/aluno/perfil" replace />
          </ProtectedRoute>
        }
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
              <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <PrivateTelemetryTracker />
                <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Carregando...</div>}>
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
