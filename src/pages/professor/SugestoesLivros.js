import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Lightbulb, Send, BookOpen, Sparkles, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
export default function SugestoesLivros() {
    const [livros, setLivros] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [sugestoes, setSugestoes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isAutoDialogOpen, setIsAutoDialogOpen] = useState(false);
    // Form states
    const [selectedAluno, setSelectedAluno] = useState('');
    const [selectedLivro, setSelectedLivro] = useState('');
    const [mensagem, setMensagem] = useState('');
    // Auto suggestion states
    const [selectedArea, setSelectedArea] = useState('');
    const [selectedTurma, setSelectedTurma] = useState('');
    const { user } = useAuth();
    const { toast } = useToast();
    const fetchData = useCallback(async () => {
        try {
            // Fetch books
            const { data: livrosData } = await supabase
                .from('livros')
                .select('id, titulo, autor, area')
                .order('titulo');
            // Fetch students (alunos only)
            const { data: usuariosData } = await supabase
                .from('usuarios_biblioteca')
                .select('id, nome, turma')
                .eq('tipo', 'aluno')
                .order('nome');
            // Fetch existing suggestions
            const { data: sugestoesData } = await supabase
                .from('sugestoes_livros')
                .select(`
          *,
          livros(titulo, autor),
          usuarios_biblioteca!sugestoes_livros_aluno_id_fkey(nome, turma)
        `)
                .order('created_at', { ascending: false });
            setLivros(livrosData || []);
            setUsuarios(usuariosData || []);
            setSugestoes(sugestoesData || []);
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
        table: 'sugestoes_livros',
        onChange: handleRealtimeChange,
    });
    useRealtimeSubscription({
        table: 'livros',
        onChange: handleRealtimeChange,
    });
    useRealtimeSubscription({
        table: 'usuarios_biblioteca',
        onChange: handleRealtimeChange,
    });
    const handleSendSugestao = async () => {
        if (!selectedAluno || !selectedLivro) {
            toast({
                variant: 'destructive',
                title: 'Erro',
                description: 'Selecione um aluno e um livro.',
            });
            return;
        }
        // Get professor's usuarios_biblioteca id
        const { data: professorData } = await supabase
            .from('usuarios_biblioteca')
            .select('id')
            .eq('user_id', user?.id)
            .single();
        if (!professorData) {
            toast({
                variant: 'destructive',
                title: 'Erro',
                description: 'Perfil de professor não encontrado.',
            });
            return;
        }
        setSaving(true);
        try {
            const { error } = await supabase
                .from('sugestoes_livros')
                .insert({
                aluno_id: selectedAluno,
                livro_id: selectedLivro,
                professor_id: professorData.id,
                mensagem: mensagem || null,
            });
            if (error)
                throw error;
            toast({ title: 'Sucesso', description: 'Sugestão enviada com sucesso!' });
            setIsDialogOpen(false);
            setSelectedAluno('');
            setSelectedLivro('');
            setMensagem('');
            fetchData();
        }
        catch (error) {
            toast({
                variant: 'destructive',
                title: 'Erro',
                description: error.message || 'Não foi possível enviar a sugestão.',
            });
        }
        finally {
            setSaving(false);
        }
    };
    const handleAutoSugestao = async () => {
        if (!selectedArea) {
            toast({
                variant: 'destructive',
                title: 'Erro',
                description: 'Selecione uma área de livros.',
            });
            return;
        }
        // Get professor's usuarios_biblioteca id
        const { data: professorData } = await supabase
            .from('usuarios_biblioteca')
            .select('id')
            .eq('user_id', user?.id)
            .single();
        if (!professorData) {
            toast({
                variant: 'destructive',
                title: 'Erro',
                description: 'Perfil de professor não encontrado.',
            });
            return;
        }
        setSaving(true);
        try {
            // Get books from selected area
            const livrosDaArea = livros.filter(l => l.area.toLowerCase() === selectedArea.toLowerCase());
            if (livrosDaArea.length === 0) {
                toast({
                    variant: 'destructive',
                    title: 'Erro',
                    description: 'Não há livros cadastrados nessa área.',
                });
                setSaving(false);
                return;
            }
            // Get students to suggest to
            let alunosParaSugerir = usuarios;
            if (selectedTurma) {
                alunosParaSugerir = usuarios.filter(u => u.turma === selectedTurma);
            }
            if (alunosParaSugerir.length === 0) {
                toast({
                    variant: 'destructive',
                    title: 'Erro',
                    description: 'Não há alunos para sugerir.',
                });
                setSaving(false);
                return;
            }
            // Create suggestions - one different book for each student
            const sugestoesPendentes = [];
            for (let i = 0; i < alunosParaSugerir.length; i++) {
                const aluno = alunosParaSugerir[i];
                const livro = livrosDaArea[i % livrosDaArea.length]; // Cycle through books
                sugestoesPendentes.push({
                    aluno_id: aluno.id,
                    livro_id: livro.id,
                    professor_id: professorData.id,
                    mensagem: `Sugestão automática da área: ${selectedArea}`,
                });
            }
            const { error } = await supabase
                .from('sugestoes_livros')
                .insert(sugestoesPendentes);
            if (error)
                throw error;
            toast({
                title: 'Sucesso',
                description: `${sugestoesPendentes.length} sugestões enviadas!`
            });
            setIsAutoDialogOpen(false);
            setSelectedArea('');
            setSelectedTurma('');
            fetchData();
        }
        catch (error) {
            toast({
                variant: 'destructive',
                title: 'Erro',
                description: error.message || 'Não foi possível enviar as sugestões.',
            });
        }
        finally {
            setSaving(false);
        }
    };
    const handleDeleteSugestao = async (id) => {
        if (!confirm('Tem certeza que deseja excluir esta sugestão?'))
            return;
        try {
            const { error } = await supabase
                .from('sugestoes_livros')
                .delete()
                .eq('id', id);
            if (error)
                throw error;
            toast({ title: 'Sucesso', description: 'Sugestão excluída.' });
            fetchData();
        }
        catch (error) {
            toast({
                variant: 'destructive',
                title: 'Erro',
                description: error.message || 'Não foi possível excluir.',
            });
        }
    };
    // Get unique areas from books
    const areas = [...new Set(livros.filter(l => l.area).map(l => l.area))].sort();
    const turmas = [...new Set(usuarios.filter(u => u.turma).map(u => u.turma))].sort();
    return (_jsx(MainLayout, { title: "Sugest\u00F5es de Livros", children: _jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4", children: [_jsx(Card, { children: _jsx(CardContent, { className: "p-6", children: _jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center", children: _jsx(Lightbulb, { className: "w-6 h-6 text-primary" }) }), _jsxs("div", { children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "Sugest\u00F5es Enviadas" }), _jsx("p", { className: "text-2xl font-bold", children: sugestoes.length })] })] }) }) }), _jsx(Card, { children: _jsx(CardContent, { className: "p-6", children: _jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center", children: _jsx(BookOpen, { className: "w-6 h-6 text-success" }) }), _jsxs("div", { children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "Lidas pelos Alunos" }), _jsx("p", { className: "text-2xl font-bold", children: sugestoes.filter(s => s.lido).length })] })] }) }) }), _jsx(Card, { children: _jsx(CardContent, { className: "p-6", children: _jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "w-12 h-12 rounded-lg bg-warning/10 flex items-center justify-center", children: _jsx(Send, { className: "w-6 h-6 text-warning" }) }), _jsxs("div", { children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "Pendentes" }), _jsx("p", { className: "text-2xl font-bold", children: sugestoes.filter(s => !s.lido).length })] })] }) }) })] }), _jsxs("div", { className: "flex flex-wrap gap-3", children: [_jsxs(Dialog, { open: isDialogOpen, onOpenChange: setIsDialogOpen, children: [_jsx(DialogTrigger, { asChild: true, children: _jsxs(Button, { children: [_jsx(Send, { className: "w-4 h-4 mr-2" }), "Sugerir para Aluno"] }) }), _jsxs(DialogContent, { children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: "Sugerir Livro para Aluno" }), _jsx(DialogDescription, { children: "Envie uma sugest\u00E3o de leitura personalizada para um aluno." })] }), _jsxs("div", { className: "space-y-4 py-4", children: [_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "Aluno *" }), _jsxs(Select, { value: selectedAluno, onValueChange: setSelectedAluno, children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, { placeholder: "Selecione um aluno" }) }), _jsx(SelectContent, { children: usuarios.map(u => (_jsxs(SelectItem, { value: u.id, children: [u.nome, " ", u.turma ? `(${u.turma})` : ''] }, u.id))) })] })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "Livro *" }), _jsxs(Select, { value: selectedLivro, onValueChange: setSelectedLivro, children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, { placeholder: "Selecione um livro" }) }), _jsx(SelectContent, { children: livros.map(l => (_jsxs(SelectItem, { value: l.id, children: [l.titulo, " - ", l.autor || 'Autor desconhecido'] }, l.id))) })] })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "Mensagem (opcional)" }), _jsx(Textarea, { value: mensagem, onChange: (e) => setMensagem(e.target.value), placeholder: "Escreva uma mensagem para o aluno...", rows: 3 })] })] }), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx(Button, { variant: "outline", onClick: () => setIsDialogOpen(false), children: "Cancelar" }), _jsx(Button, { onClick: handleSendSugestao, disabled: saving, children: saving ? 'Enviando...' : 'Enviar Sugestão' })] })] })] }), _jsxs(Dialog, { open: isAutoDialogOpen, onOpenChange: setIsAutoDialogOpen, children: [_jsx(DialogTrigger, { asChild: true, children: _jsxs(Button, { variant: "secondary", children: [_jsx(Sparkles, { className: "w-4 h-4 mr-2" }), "Sugest\u00E3o Autom\u00E1tica por Turma"] }) }), _jsxs(DialogContent, { children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: "Sugest\u00E3o Autom\u00E1tica" }), _jsx(DialogDescription, { children: "Selecione uma \u00E1rea e turma. O sistema ir\u00E1 sugerir um livro diferente para cada aluno." })] }), _jsxs("div", { className: "space-y-4 py-4", children: [_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "\u00C1rea do Livro *" }), _jsxs(Select, { value: selectedArea, onValueChange: setSelectedArea, children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, { placeholder: "Selecione uma \u00E1rea" }) }), _jsx(SelectContent, { children: areas.map(area => (_jsxs(SelectItem, { value: area, children: [area, " (", livros.filter(l => l.area === area).length, " livros)"] }, area))) })] })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "Turma (opcional - deixe vazio para todos os alunos)" }), _jsxs(Select, { value: selectedTurma || 'all', onValueChange: (v) => setSelectedTurma(v === 'all' ? '' : v), children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, { placeholder: "Todas as turmas" }) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "all", children: "Todas as turmas" }), turmas.map(turma => (_jsxs(SelectItem, { value: turma, children: [turma, " (", usuarios.filter(u => u.turma === turma).length, " alunos)"] }, turma)))] })] })] }), selectedArea && (_jsxs("p", { className: "text-sm text-muted-foreground", children: ["Ser\u00E3o enviadas sugest\u00F5es para ", selectedTurma
                                                            ? usuarios.filter(u => u.turma === selectedTurma).length
                                                            : usuarios.length, " aluno(s)."] }))] }), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx(Button, { variant: "outline", onClick: () => setIsAutoDialogOpen(false), children: "Cancelar" }), _jsx(Button, { onClick: handleAutoSugestao, disabled: saving, children: saving ? 'Enviando...' : 'Enviar Sugestões' })] })] })] })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsxs(CardTitle, { className: "flex items-center gap-2", children: [_jsx(Lightbulb, { className: "w-5 h-5" }), "Hist\u00F3rico de Sugest\u00F5es"] }) }), _jsx(CardContent, { children: loading ? (_jsx("p", { className: "text-center text-muted-foreground py-8", children: "Carregando..." })) : sugestoes.length === 0 ? (_jsx("p", { className: "text-center text-muted-foreground py-8", children: "Nenhuma sugest\u00E3o enviada ainda" })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs(Table, { children: [_jsx(TableHeader, { children: _jsxs(TableRow, { children: [_jsx(TableHead, { children: "Aluno" }), _jsx(TableHead, { children: "Turma" }), _jsx(TableHead, { children: "Livro" }), _jsx(TableHead, { children: "Mensagem" }), _jsx(TableHead, { children: "Data" }), _jsx(TableHead, { children: "Status" }), _jsx(TableHead, { className: "text-right", children: "A\u00E7\u00F5es" })] }) }), _jsx(TableBody, { children: sugestoes.map((sugestao) => (_jsxs(TableRow, { children: [_jsx(TableCell, { className: "font-medium", children: sugestao.usuarios_biblioteca?.nome || 'N/A' }), _jsx(TableCell, { children: sugestao.usuarios_biblioteca?.turma || '-' }), _jsx(TableCell, { children: sugestao.livros?.titulo || 'N/A' }), _jsx(TableCell, { className: "max-w-[200px] truncate", children: sugestao.mensagem || '-' }), _jsx(TableCell, { children: format(new Date(sugestao.created_at), "dd/MM/yyyy", { locale: ptBR }) }), _jsx(TableCell, { children: _jsx(Badge, { variant: sugestao.lido ? 'default' : 'secondary', children: sugestao.lido ? 'Lido' : 'Pendente' }) }), _jsx(TableCell, { className: "text-right", children: _jsx(Button, { variant: "ghost", size: "icon", onClick: () => handleDeleteSugestao(sugestao.id), children: _jsx(Trash2, { className: "w-4 h-4 text-destructive" }) }) })] }, sugestao.id))) })] }) })) })] })] }) }));
}
