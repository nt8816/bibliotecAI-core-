import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";

import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Livros from "./pages/Livros";
import Usuarios from "./pages/Usuarios";
import Emprestimos from "./pages/Emprestimos";
import Relatorios from "./pages/Relatorios";
import NotFound from "./pages/NotFound";
import GerenciarTokens from "./pages/GerenciarTokens";
import Convite from "./pages/Convite";
import ImportarUsuarios from "./pages/ImportarUsuarios";
import ExportarRelatorios from "./pages/ExportarRelatorios";
import ConfiguracaoEscola from "./pages/ConfiguracaoEscola";

// Professor pages
import MeusAlunos from "./pages/professor/MeusAlunos";
import SugestoesLivros from "./pages/professor/SugestoesLivros";
import AtividadesLeitura from "./pages/professor/AtividadesLeitura";
import RelatoriosLeitura from "./pages/professor/RelatoriosLeitura";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/convite/:token" element={<Convite />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
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
              path="/importar-usuarios"
              element={
                <ProtectedRoute>
                  <ImportarUsuarios />
                </ProtectedRoute>
              }
            />
            <Route
              path="/exportar-relatorios"
              element={
                <ProtectedRoute>
                  <ExportarRelatorios />
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
            {/* Professor Routes */}
            <Route
              path="/professor/alunos"
              element={
                <ProtectedRoute>
                  <MeusAlunos />
                </ProtectedRoute>
              }
            />
            <Route
              path="/professor/sugestoes"
              element={
                <ProtectedRoute>
                  <SugestoesLivros />
                </ProtectedRoute>
              }
            />
            <Route
              path="/professor/atividades"
              element={
                <ProtectedRoute>
                  <AtividadesLeitura />
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
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
