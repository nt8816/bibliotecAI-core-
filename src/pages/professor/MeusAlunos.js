import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Search, Users, GraduationCap } from 'lucide-react';
export default function MeusAlunos() {
    const [usuarios, setUsuarios] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterTurma, setFilterTurma] = useState('');
    const { toast } = useToast();
    const fetchUsuarios = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('usuarios_biblioteca')
                .select('id, nome, tipo, matricula, turma, email')
                .eq('tipo', 'aluno')
                .order('nome');
            if (error)
                throw error;
            setUsuarios(data || []);
        }
        catch (error) {
            console.error('Error fetching users:', error);
            toast({
                variant: 'destructive',
                title: 'Erro',
                description: 'Não foi possível carregar os usuários.',
            });
        }
        finally {
            setLoading(false);
        }
    }, [toast]);
    useEffect(() => {
        fetchUsuarios();
    }, [fetchUsuarios]);
    // Realtime subscription para sincronização automática
    const handleRealtimeChange = useCallback(() => {
        fetchUsuarios();
    }, [fetchUsuarios]);
    useRealtimeSubscription({
        table: 'usuarios_biblioteca',
        onChange: handleRealtimeChange,
    });
    const getTipoBadgeVariant = (tipo) => {
        switch (tipo) {
            case 'gestor':
                return 'default';
            case 'professor':
                return 'secondary';
            case 'bibliotecaria':
                return 'outline';
            default:
                return 'outline';
        }
    };
    const getTipoLabel = (tipo) => {
        switch (tipo) {
            case 'gestor':
                return 'Gestor';
            case 'professor':
                return 'Professor';
            case 'bibliotecaria':
                return 'Bibliotecária';
            default:
                return 'Aluno';
        }
    };
    // Get unique turmas for filter
    const turmas = [...new Set(usuarios.filter(u => u.turma).map(u => u.turma))].sort();
    const filteredUsuarios = usuarios.filter((usuario) => {
        const matchesSearch = usuario.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
            usuario.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
            usuario.matricula?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesTurma = !filterTurma || usuario.turma === filterTurma;
        return matchesSearch && matchesTurma;
    });
    // Count
    const alunosCount = usuarios.length;
    return (_jsx(MainLayout, { title: "Meus Alunos", children: _jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [_jsx(Card, { children: _jsx(CardContent, { className: "p-6", children: _jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center", children: _jsx(GraduationCap, { className: "w-6 h-6 text-primary" }) }), _jsxs("div", { children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "Total de Alunos" }), _jsx("p", { className: "text-2xl font-bold", children: alunosCount })] })] }) }) }), _jsx(Card, { children: _jsx(CardContent, { className: "p-6", children: _jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "w-12 h-12 rounded-lg bg-info/10 flex items-center justify-center", children: _jsx(Users, { className: "w-6 h-6 text-info" }) }), _jsxs("div", { children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "Turmas" }), _jsx("p", { className: "text-2xl font-bold", children: turmas.length })] })] }) }) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsxs("div", { className: "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4", children: [_jsxs(CardTitle, { className: "flex items-center gap-2", children: [_jsx(Users, { className: "w-5 h-5" }), "Visualizar Usu\u00E1rios"] }), _jsxs("div", { className: "flex flex-col sm:flex-row gap-2 w-full sm:w-auto", children: [_jsxs("div", { className: "relative flex-1 sm:w-64", children: [_jsx(Search, { className: "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" }), _jsx(Input, { placeholder: "Buscar usu\u00E1rios...", className: "pl-9", value: searchTerm, onChange: (e) => setSearchTerm(e.target.value) })] }), turmas.length > 0 && (_jsxs("select", { className: "h-10 px-3 rounded-md border border-input bg-background text-sm", value: filterTurma, onChange: (e) => setFilterTurma(e.target.value), children: [_jsx("option", { value: "", children: "Todas as turmas" }), turmas.map(turma => (_jsx("option", { value: turma, children: turma }, turma)))] }))] })] }) }), _jsx(CardContent, { children: loading ? (_jsx("p", { className: "text-center text-muted-foreground py-8", children: "Carregando..." })) : filteredUsuarios.length === 0 ? (_jsx("p", { className: "text-center text-muted-foreground py-8", children: searchTerm || filterTurma ? 'Nenhum usuário encontrado' : 'Nenhum usuário cadastrado' })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs(Table, { children: [_jsx(TableHeader, { children: _jsxs(TableRow, { children: [_jsx(TableHead, { children: "Nome" }), _jsx(TableHead, { children: "Email" }), _jsx(TableHead, { children: "Tipo" }), _jsx(TableHead, { children: "Matr\u00EDcula" }), _jsx(TableHead, { children: "Turma" })] }) }), _jsx(TableBody, { children: filteredUsuarios.map((usuario) => (_jsxs(TableRow, { children: [_jsx(TableCell, { className: "font-medium", children: usuario.nome }), _jsx(TableCell, { children: usuario.email }), _jsx(TableCell, { children: _jsx(Badge, { variant: getTipoBadgeVariant(usuario.tipo), children: getTipoLabel(usuario.tipo) }) }), _jsx(TableCell, { children: usuario.matricula || '-' }), _jsx(TableCell, { children: usuario.turma || '-' })] }, usuario.id))) })] }) })) })] })] }) }));
}
