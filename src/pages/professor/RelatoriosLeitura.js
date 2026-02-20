import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { BarChart3, BookOpen, TrendingUp, Filter, Calendar, GraduationCap } from 'lucide-react';
import { format, parseISO, isWithinInterval, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
export default function RelatoriosLeitura() {
    const [usuarios, setUsuarios] = useState([]);
    const [emprestimos, setEmprestimos] = useState([]);
    const [loading, setLoading] = useState(true);
    // Filters
    const [filterTurma, setFilterTurma] = useState('');
    const [periodoInicio, setPeriodoInicio] = useState(format(startOfMonth(subMonths(new Date(), 3)), 'yyyy-MM-dd'));
    const [periodoFim, setPeriodoFim] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
    const { toast } = useToast();
    const fetchData = useCallback(async () => {
        try {
            const { data: usuariosData } = await supabase
                .from('usuarios_biblioteca')
                .select('id, nome, turma')
                .eq('tipo', 'aluno')
                .order('nome');
            const { data: emprestimosData } = await supabase
                .from('emprestimos')
                .select(`
          id,
          usuario_id,
          data_emprestimo,
          data_devolucao_real,
          status,
          livros(titulo),
          usuarios_biblioteca(nome, turma)
        `)
                .order('data_emprestimo', { ascending: false });
            setUsuarios(usuariosData || []);
            setEmprestimos(emprestimosData || []);
        }
        catch (error) {
            console.error('Error fetching data:', error);
            toast({
                variant: 'destructive',
                title: 'Erro',
                description: 'Não foi possível carregar os dados.',
            });
        }
        finally {
            setLoading(false);
        }
    }, [toast]);
    useEffect(() => {
        fetchData();
    }, [fetchData]);
    // Realtime subscription para sincronização automática
    const handleRealtimeChange = useCallback(() => {
        fetchData();
    }, [fetchData]);
    useRealtimeSubscription({
        table: 'emprestimos',
        onChange: handleRealtimeChange,
    });
    useRealtimeSubscription({
        table: 'usuarios_biblioteca',
        onChange: handleRealtimeChange,
    });
    // Filter emprestimos by period
    const filteredEmprestimos = emprestimos.filter(emp => {
        const dataEmprestimo = parseISO(emp.data_emprestimo);
        const inicio = parseISO(periodoInicio);
        const fim = parseISO(periodoFim);
        return isWithinInterval(dataEmprestimo, { start: inicio, end: fim });
    });
    // Calculate stats per student
    const alunoStats = usuarios
        .filter(u => !filterTurma || u.turma === filterTurma)
        .map(usuario => {
        const emprestimosDoAluno = filteredEmprestimos.filter(e => e.usuario_id === usuario.id);
        const livrosLidos = emprestimosDoAluno.filter(e => e.status === 'devolvido').length;
        const emprestimosAtivos = emprestimosDoAluno.filter(e => e.status === 'ativo').length;
        const ultimoEmprestimo = emprestimosDoAluno.length > 0
            ? emprestimosDoAluno[0].data_emprestimo
            : null;
        return {
            id: usuario.id,
            nome: usuario.nome,
            turma: usuario.turma,
            livrosLidos,
            emprestimosAtivos,
            ultimoEmprestimo,
        };
    })
        .sort((a, b) => b.livrosLidos - a.livrosLidos);
    // Get unique turmas
    const turmas = [...new Set(usuarios.filter(u => u.turma).map(u => u.turma))].sort();
    // Overall stats
    const totalLivrosLidos = alunoStats.reduce((acc, a) => acc + a.livrosLidos, 0);
    const mediaLivrosPorAluno = alunoStats.length > 0 ? (totalLivrosLidos / alunoStats.length).toFixed(1) : '0';
    const maxLivros = Math.max(...alunoStats.map(a => a.livrosLidos), 1);
    const alunosComLeitura = alunoStats.filter(a => a.livrosLidos > 0).length;
    // Top readers
    const topReaders = alunoStats.slice(0, 5);
    return (_jsx(MainLayout, { title: "Relat\u00F3rios de Leitura", children: _jsxs("div", { className: "space-y-6", children: [_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsxs(CardTitle, { className: "flex items-center gap-2", children: [_jsx(Filter, { className: "w-5 h-5" }), "Filtros do Per\u00EDodo"] }) }), _jsx(CardContent, { children: _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-4 gap-4", children: [_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "Data In\u00EDcio" }), _jsx(Input, { type: "date", value: periodoInicio, onChange: (e) => setPeriodoInicio(e.target.value) })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "Data Fim" }), _jsx(Input, { type: "date", value: periodoFim, onChange: (e) => setPeriodoFim(e.target.value) })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "Turma" }), _jsxs(Select, { value: filterTurma || "all", onValueChange: (v) => setFilterTurma(v === "all" ? "" : v), children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, { placeholder: "Todas as turmas" }) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "all", children: "Todas as turmas" }), turmas.map(turma => (_jsx(SelectItem, { value: turma, children: turma }, turma)))] })] })] }), _jsx("div", { className: "flex items-end", children: _jsx(Button, { variant: "outline", onClick: () => {
                                                setPeriodoInicio(format(startOfMonth(subMonths(new Date(), 3)), 'yyyy-MM-dd'));
                                                setPeriodoFim(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
                                                setFilterTurma('');
                                            }, children: "Limpar Filtros" }) })] }) })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-4 gap-4", children: [_jsx(Card, { children: _jsx(CardContent, { className: "p-6", children: _jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center", children: _jsx(BookOpen, { className: "w-6 h-6 text-primary" }) }), _jsxs("div", { children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "Total de Livros Lidos" }), _jsx("p", { className: "text-2xl font-bold", children: totalLivrosLidos })] })] }) }) }), _jsx(Card, { children: _jsx(CardContent, { className: "p-6", children: _jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "w-12 h-12 rounded-lg bg-info/10 flex items-center justify-center", children: _jsx(TrendingUp, { className: "w-6 h-6 text-info" }) }), _jsxs("div", { children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "M\u00E9dia por Aluno" }), _jsx("p", { className: "text-2xl font-bold", children: mediaLivrosPorAluno })] })] }) }) }), _jsx(Card, { children: _jsx(CardContent, { className: "p-6", children: _jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center", children: _jsx(GraduationCap, { className: "w-6 h-6 text-success" }) }), _jsxs("div", { children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "Alunos Ativos" }), _jsx("p", { className: "text-2xl font-bold", children: alunosComLeitura })] })] }) }) }), _jsx(Card, { children: _jsx(CardContent, { className: "p-6", children: _jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "w-12 h-12 rounded-lg bg-secondary/10 flex items-center justify-center", children: _jsx(Calendar, { className: "w-6 h-6 text-secondary" }) }), _jsxs("div", { children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "Per\u00EDodo" }), _jsxs("p", { className: "text-sm font-medium", children: [format(parseISO(periodoInicio), 'dd/MM'), " - ", format(parseISO(periodoFim), 'dd/MM/yyyy')] })] })] }) }) })] }), topReaders.length > 0 && topReaders[0].livrosLidos > 0 && (_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsxs(CardTitle, { className: "flex items-center gap-2", children: [_jsx(TrendingUp, { className: "w-5 h-5" }), "Top 5 Leitores do Per\u00EDodo"] }) }), _jsx(CardContent, { children: _jsx("div", { className: "space-y-4", children: topReaders.filter(r => r.livrosLidos > 0).map((aluno, index) => (_jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary", children: index + 1 }), _jsxs("div", { className: "flex-1", children: [_jsxs("div", { className: "flex justify-between items-center mb-1", children: [_jsx("span", { className: "font-medium", children: aluno.nome }), _jsxs("span", { className: "text-sm text-muted-foreground", children: [aluno.livrosLidos, " livro", aluno.livrosLidos !== 1 ? 's' : ''] })] }), _jsx(Progress, { value: (aluno.livrosLidos / maxLivros) * 100, className: "h-2" })] })] }, aluno.id))) }) })] })), _jsxs(Card, { children: [_jsxs(CardHeader, { children: [_jsxs(CardTitle, { className: "flex items-center gap-2", children: [_jsx(BarChart3, { className: "w-5 h-5" }), "Detalhamento por Aluno"] }), _jsx(CardDescription, { children: "Quantidade de livros lidos por cada aluno no per\u00EDodo selecionado" })] }), _jsx(CardContent, { children: loading ? (_jsx("p", { className: "text-center text-muted-foreground py-8", children: "Carregando..." })) : alunoStats.length === 0 ? (_jsx("p", { className: "text-center text-muted-foreground py-8", children: "Nenhum aluno encontrado" })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs(Table, { children: [_jsx(TableHeader, { children: _jsxs(TableRow, { children: [_jsx(TableHead, { children: "Posi\u00E7\u00E3o" }), _jsx(TableHead, { children: "Aluno" }), _jsx(TableHead, { children: "Turma" }), _jsx(TableHead, { className: "text-center", children: "Livros Lidos" }), _jsx(TableHead, { className: "text-center", children: "Em Andamento" }), _jsx(TableHead, { children: "\u00DAltimo Empr\u00E9stimo" }), _jsx(TableHead, { children: "Engajamento" })] }) }), _jsx(TableBody, { children: alunoStats.map((aluno, index) => (_jsxs(TableRow, { children: [_jsxs(TableCell, { className: "font-medium", children: ["#", index + 1] }), _jsx(TableCell, { className: "font-medium", children: aluno.nome }), _jsx(TableCell, { children: aluno.turma || '-' }), _jsx(TableCell, { className: "text-center", children: _jsx(Badge, { variant: aluno.livrosLidos > 0 ? 'default' : 'outline', children: aluno.livrosLidos }) }), _jsx(TableCell, { className: "text-center", children: _jsx(Badge, { variant: "secondary", children: aluno.emprestimosAtivos }) }), _jsx(TableCell, { children: aluno.ultimoEmprestimo
                                                            ? format(parseISO(aluno.ultimoEmprestimo), "dd/MM/yyyy", { locale: ptBR })
                                                            : 'Nunca' }), _jsx(TableCell, { children: _jsx("div", { className: "w-24", children: _jsx(Progress, { value: maxLivros > 0 ? (aluno.livrosLidos / maxLivros) * 100 : 0, className: "h-2" }) }) })] }, aluno.id))) })] }) })) })] })] }) }));
}
