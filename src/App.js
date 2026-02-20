import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Livros from "./pages/Livros.jsx";
import Usuarios from "./pages/Usuarios.jsx";
import Emprestimos from "./pages/Emprestimos";
import Relatorios from "./pages/Relatorios";
import NotFound from "./pages/NotFound";
import GerenciarTokens from "./pages/GerenciarTokens.jsx";
import Convite from "./pages/Convite";
import ConfiguracaoEscola from "./pages/ConfiguracaoEscola";
// Professor pages
import MeusAlunos from "./pages/professor/MeusAlunos";
import PainelProfessor from "./pages/professor/PainelProfessor";
import RelatoriosLeitura from "./pages/professor/RelatoriosLeitura";
// Aluno pages
import PainelAluno from "./pages/aluno/PainelAluno";
import ComunidadeAluno from "./pages/aluno/ComunidadeAluno";
const queryClient = new QueryClient();
const App = () => (_jsx(QueryClientProvider, { client: queryClient, children: _jsx(AuthProvider, { children: _jsxs(TooltipProvider, { children: [_jsx(Toaster, {}), _jsx(Sonner, {}), _jsx(HashRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true }, children: _jsxs(Routes, { children: [_jsx(Route, { path: "/auth", element: _jsx(Auth, {}) }), _jsx(Route, { path: "/convite/:token", element: _jsx(Convite, {}) }), _jsx(Route, { path: "/", element: _jsx(Navigate, { to: "/dashboard", replace: true }) }), _jsx(Route, { path: "/dashboard", element: _jsx(ProtectedRoute, { children: _jsx(Dashboard, {}) }) }), _jsx(Route, { path: "/livros", element: _jsx(ProtectedRoute, { children: _jsx(Livros, {}) }) }), _jsx(Route, { path: "/usuarios", element: _jsx(ProtectedRoute, { children: _jsx(Usuarios, {}) }) }), _jsx(Route, { path: "/emprestimos", element: _jsx(ProtectedRoute, { children: _jsx(Emprestimos, {}) }) }), _jsx(Route, { path: "/relatorios", element: _jsx(ProtectedRoute, { children: _jsx(Relatorios, {}) }) }), _jsx(Route, { path: "/tokens", element: _jsx(ProtectedRoute, { children: _jsx(GerenciarTokens, {}) }) }), _jsx(Route, { path: "/configuracao-escola", element: _jsx(ProtectedRoute, { children: _jsx(ConfiguracaoEscola, {}) }) }), _jsx(Route, { path: "/professor/alunos", element: _jsx(ProtectedRoute, { children: _jsx(MeusAlunos, {}) }) }), _jsx(Route, { path: "/professor/painel", element: _jsx(ProtectedRoute, { children: _jsx(PainelProfessor, {}) }) }), _jsx(Route, { path: "/professor/relatorios", element: _jsx(ProtectedRoute, { children: _jsx(RelatoriosLeitura, {}) }) }), _jsx(Route, { path: "/aluno/painel", element: _jsx(ProtectedRoute, { children: _jsx(PainelAluno, {}) }) }), _jsx(Route, { path: "/aluno/comunidade", element: _jsx(ProtectedRoute, { children: _jsx(ComunidadeAluno, {}) }) }), _jsx(Route, { path: "*", element: _jsx(NotFound, {}) })] }) })] }) }) }));
export default App;
