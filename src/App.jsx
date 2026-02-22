import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider } from '@/hooks/useAuth';
import { TenantProvider, useTenant } from '@/hooks/useTenant';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { SuperAdminRoute } from '@/components/SuperAdminRoute';

import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Livros from './pages/Livros.jsx';
import Usuarios from './pages/Usuarios.jsx';
import Emprestimos from './pages/Emprestimos';
import Relatorios from './pages/Relatorios';
import NotFound from './pages/NotFound';
import TenantNotFound from './pages/TenantNotFound';
import GerenciarTokens from './pages/GerenciarTokens.jsx';
import Convite from './pages/Convite';
import ConfiguracaoEscola from './pages/ConfiguracaoEscola';
import AdminTenants from './pages/AdminTenants';
import OnboardingGestor from './pages/OnboardingGestor';
import ComunidadeAluno from './pages/aluno/ComunidadeAluno';

import MeusAlunos from './pages/professor/MeusAlunos';
import PainelProfessor from './pages/professor/PainelProfessor';
import RelatoriosLeitura from './pages/professor/RelatoriosLeitura';

import PainelAluno from './pages/aluno/PainelAluno';

const queryClient = new QueryClient();

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
    <TenantProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AppRoutes />
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </TenantProvider>
  </QueryClientProvider>
);

export default App;
