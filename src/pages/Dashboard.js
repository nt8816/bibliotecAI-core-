import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useAuth } from '@/hooks/useAuth';
import { BookOpen, Users, BookMarked, AlertTriangle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
export default function Dashboard() {
    const { userRole } = useAuth();
    const [stats, setStats] = useState({
        totalLivros: 0,
        totalUsuarios: 0,
        emprestimosAtivos: 0,
        emprestimosAtrasados: 0,
    });
    const [atividades, setAtividades] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        fetchData();
    }, []);
    const handleRealtimeChange = useCallback(() => {
        fetchData();
    }, []);
    useRealtimeSubscription({ table: 'livros', onChange: handleRealtimeChange });
    useRealtimeSubscription({ table: 'usuarios_biblioteca', onChange: handleRealtimeChange });
    useRealtimeSubscription({ table: 'emprestimos', onChange: handleRealtimeChange });
    const fetchData = async () => {
        // Run all queries in parallel, handle individual failures gracefully
        const [livrosResult, usuariosResult, emprestimosAtivosResult, atrasadosResult, emprestimosRecentesResult] = await Promise.allSettled([
            supabase.from('livros').select('*', { count: 'exact', head: true }),
            supabase.from('usuarios_biblioteca').select('*', { count: 'exact', head: true }),
            supabase.from('emprestimos').select('*', { count: 'exact', head: true }).eq('status', 'ativo'),
            supabase.from('emprestimos').select('*', { count: 'exact', head: true }).eq('status', 'ativo').lt('data_devolucao_prevista', new Date().toISOString()),
            supabase.from('emprestimos').select(`id, data_emprestimo, data_devolucao_real, status, livros(titulo), usuarios_biblioteca(nome)`).order('created_at', { ascending: false }).limit(5),
        ]);
        setStats({
            totalLivros: livrosResult.status === 'fulfilled' ? (livrosResult.value.count || 0) : 0,
            totalUsuarios: usuariosResult.status === 'fulfilled' ? (usuariosResult.value.count || 0) : 0,
            emprestimosAtivos: emprestimosAtivosResult.status === 'fulfilled' ? (emprestimosAtivosResult.value.count || 0) : 0,
            emprestimosAtrasados: atrasadosResult.status === 'fulfilled' ? (atrasadosResult.value.count || 0) : 0,
        });
        if (emprestimosRecentesResult.status === 'fulfilled' && emprestimosRecentesResult.value.data) {
            const atividadesFormatadas = emprestimosRecentesResult.value.data.map((emp) => ({
                id: emp.id,
                tipo: emp.data_devolucao_real ? 'devolucao' : 'emprestimo',
                descricao: emp.data_devolucao_real
                    ? `${emp.usuarios_biblioteca?.nome || 'Usuário'} devolveu "${emp.livros?.titulo || 'Livro'}"`
                    : `${emp.usuarios_biblioteca?.nome || 'Usuário'} emprestou "${emp.livros?.titulo || 'Livro'}"`,
                data: emp.data_devolucao_real || emp.data_emprestimo,
            }));
            setAtividades(atividadesFormatadas);
        }
        setLoading(false);
    };
    const statCards = [
        {
            title: 'Total de Livros',
            value: stats.totalLivros,
            icon: BookOpen,
            color: 'text-primary',
            bgColor: 'bg-primary/10',
        },
        {
            title: 'Total de Usuários',
            value: stats.totalUsuarios,
            icon: Users,
            color: 'text-info',
            bgColor: 'bg-info/10',
        },
        {
            title: 'Leituras Ativas',
            value: stats.emprestimosAtivos,
            icon: BookMarked,
            color: 'text-secondary',
            bgColor: 'bg-secondary/10',
        },
        {
            title: 'Alertas de Atraso',
            value: stats.emprestimosAtrasados,
            icon: AlertTriangle,
            color: 'text-warning',
            bgColor: 'bg-warning/10',
        },
    ];
    if (userRole === 'aluno') {
        return _jsx(Navigate, { to: "/aluno/painel", replace: true });
    }
    if (userRole === 'professor') {
        return _jsx(Navigate, { to: "/professor/painel", replace: true });
    }
    return (_jsx(MainLayout, { title: "Dashboard", children: _jsxs("div", { className: "space-y-6", children: [_jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4", children: statCards.map((card) => (_jsx(Card, { className: "stat-card", children: _jsx(CardContent, { className: "p-6", children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm text-muted-foreground", children: card.title }), _jsx("p", { className: "text-3xl font-bold mt-1", children: loading ? '...' : card.value })] }), _jsx("div", { className: `w-12 h-12 rounded-lg ${card.bgColor} flex items-center justify-center`, children: _jsx(card.icon, { className: `w-6 h-6 ${card.color}` }) })] }) }) }, card.title))) }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsxs(CardTitle, { className: "flex items-center gap-2", children: [_jsx(Clock, { className: "w-5 h-5" }), "Atividades Recentes"] }) }), _jsx(CardContent, { children: loading ? (_jsx("p", { className: "text-muted-foreground", children: "Carregando..." })) : atividades.length === 0 ? (_jsx("p", { className: "text-muted-foreground", children: "Nenhuma atividade recente" })) : (_jsx("div", { className: "space-y-4", children: atividades.map((atividade) => (_jsxs("div", { className: "flex items-center gap-4 p-3 rounded-lg bg-muted/50", children: [_jsx("div", { className: `w-10 h-10 rounded-full flex items-center justify-center ${atividade.tipo === 'emprestimo' ? 'bg-primary/10' : 'bg-success/10'}`, children: _jsx(BookMarked, { className: `w-5 h-5 ${atividade.tipo === 'emprestimo' ? 'text-primary' : 'text-success'}` }) }), _jsxs("div", { className: "flex-1", children: [_jsx("p", { className: "font-medium", children: atividade.descricao }), _jsx("p", { className: "text-sm text-muted-foreground", children: format(new Date(atividade.data), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR }) })] })] }, atividade.id))) })) })] })] }) }));
}
