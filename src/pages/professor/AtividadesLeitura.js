import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { ClipboardList, Plus, Pencil, Trash2, CheckCircle, Clock, Star } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
const emptyAtividade = {
    titulo: '',
    descricao: '',
    pontos_extras: 0,
    data_entrega: '',
    livro_id: '',
    aluno_id: '',
};
export default function AtividadesLeitura() {
    const [livros, setLivros] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [atividades, setAtividades] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingAtividade, setEditingAtividade] = useState(null);
    const [formData, setFormData] = useState(emptyAtividade);
    const [filterStatus, setFilterStatus] = useState('');
    const { user } = useAuth();
    const { toast } = useToast();
    const fetchData = useCallback(async () => {
        try {
            const { data: livrosData } = await supabase
                .from('livros')
                .select('id, titulo, autor')
                .order('titulo');
            const { data: usuariosData } = await supabase
                .from('usuarios_biblioteca')
                .select('id, nome, turma')
                .eq('tipo', 'aluno')
                .order('nome');
            const { data: atividadesData } = await supabase
                .from('atividades_leitura')
                .select(`
          *,
          livros(titulo, autor),
          usuarios_biblioteca!atividades_leitura_aluno_id_fkey(nome, turma)
        `)
                .order('created_at', { ascending: false });
            setLivros(livrosData || []);
            setUsuarios(usuariosData || []);
            setAtividades(atividadesData || []);
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
        table: 'atividades_leitura',
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
    const handleOpenDialog = (atividade) => {
        if (atividade) {
            setEditingAtividade(atividade);
            setFormData({
                titulo: atividade.titulo,
                descricao: atividade.descricao || '',
                pontos_extras: atividade.pontos_extras || 0,
                data_entrega: atividade.data_entrega ? atividade.data_entrega.split('T')[0] : '',
                livro_id: atividade.livro_id,
                aluno_id: atividade.aluno_id,
            });
        }
        else {
            setEditingAtividade(null);
            setFormData(emptyAtividade);
        }
        setIsDialogOpen(true);
    };
    const handleSave = async () => {
        if (!formData.titulo.trim() || !formData.aluno_id || !formData.livro_id) {
            toast({
                variant: 'destructive',
                title: 'Erro',
                description: 'Preencha todos os campos obrigatórios.',
            });
            return;
        }
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
            const dataToSave = {
                titulo: formData.titulo,
                descricao: formData.descricao || null,
                pontos_extras: formData.pontos_extras || 0,
                data_entrega: formData.data_entrega ? new Date(formData.data_entrega).toISOString() : null,
                livro_id: formData.livro_id,
                aluno_id: formData.aluno_id,
                professor_id: professorData.id,
            };
            if (editingAtividade) {
                const { error } = await supabase
                    .from('atividades_leitura')
                    .update(dataToSave)
                    .eq('id', editingAtividade.id);
                if (error)
                    throw error;
                toast({ title: 'Sucesso', description: 'Atividade atualizada!' });
            }
            else {
                const { error } = await supabase
                    .from('atividades_leitura')
                    .insert(dataToSave);
                if (error)
                    throw error;
                toast({ title: 'Sucesso', description: 'Atividade criada!' });
            }
            setIsDialogOpen(false);
            fetchData();
        }
        catch (error) {
            toast({
                variant: 'destructive',
                title: 'Erro',
                description: error.message || 'Não foi possível salvar a atividade.',
            });
        }
        finally {
            setSaving(false);
        }
    };
    const handleUpdateStatus = async (id, newStatus) => {
        try {
            const { error } = await supabase
                .from('atividades_leitura')
                .update({ status: newStatus })
                .eq('id', id);
            if (error)
                throw error;
            toast({ title: 'Sucesso', description: 'Status atualizado!' });
            fetchData();
        }
        catch (error) {
            toast({
                variant: 'destructive',
                title: 'Erro',
                description: error.message || 'Não foi possível atualizar o status.',
            });
        }
    };
    const handleDelete = async (id) => {
        if (!confirm('Tem certeza que deseja excluir esta atividade?'))
            return;
        try {
            const { error } = await supabase
                .from('atividades_leitura')
                .delete()
                .eq('id', id);
            if (error)
                throw error;
            toast({ title: 'Sucesso', description: 'Atividade excluída.' });
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
    const getStatusBadge = (status) => {
        switch (status) {
            case 'concluido':
                return _jsx(Badge, { className: "bg-success text-success-foreground", children: "Conclu\u00EDdo" });
            case 'em_andamento':
                return _jsx(Badge, { variant: "secondary", children: "Em Andamento" });
            default:
                return _jsx(Badge, { variant: "outline", children: "Pendente" });
        }
    };
    const filteredAtividades = filterStatus
        ? atividades.filter(a => a.status === filterStatus)
        : atividades;
    // Stats
    const totalPontos = atividades.reduce((acc, a) => acc + (a.pontos_extras || 0), 0);
    const concluidas = atividades.filter(a => a.status === 'concluido').length;
    const pendentes = atividades.filter(a => a.status === 'pendente').length;
    return (_jsx(MainLayout, { title: "Atividades de Leitura", children: _jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-4 gap-4", children: [_jsx(Card, { children: _jsx(CardContent, { className: "p-6", children: _jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center", children: _jsx(ClipboardList, { className: "w-6 h-6 text-primary" }) }), _jsxs("div", { children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "Total de Atividades" }), _jsx("p", { className: "text-2xl font-bold", children: atividades.length })] })] }) }) }), _jsx(Card, { children: _jsx(CardContent, { className: "p-6", children: _jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center", children: _jsx(CheckCircle, { className: "w-6 h-6 text-success" }) }), _jsxs("div", { children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "Conclu\u00EDdas" }), _jsx("p", { className: "text-2xl font-bold", children: concluidas })] })] }) }) }), _jsx(Card, { children: _jsx(CardContent, { className: "p-6", children: _jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "w-12 h-12 rounded-lg bg-warning/10 flex items-center justify-center", children: _jsx(Clock, { className: "w-6 h-6 text-warning" }) }), _jsxs("div", { children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "Pendentes" }), _jsx("p", { className: "text-2xl font-bold", children: pendentes })] })] }) }) }), _jsx(Card, { children: _jsx(CardContent, { className: "p-6", children: _jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "w-12 h-12 rounded-lg bg-secondary/10 flex items-center justify-center", children: _jsx(Star, { className: "w-6 h-6 text-secondary" }) }), _jsxs("div", { children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "Pontos Distribu\u00EDdos" }), _jsx("p", { className: "text-2xl font-bold", children: totalPontos })] })] }) }) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsxs("div", { className: "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4", children: [_jsxs("div", { children: [_jsxs(CardTitle, { className: "flex items-center gap-2", children: [_jsx(ClipboardList, { className: "w-5 h-5" }), "Gerenciar Atividades"] }), _jsx(CardDescription, { children: "Crie atividades como resenhas, resumos e atribua pontos aos alunos" })] }), _jsxs("div", { className: "flex gap-2", children: [_jsxs(Select, { value: filterStatus || "all", onValueChange: (v) => setFilterStatus(v === "all" ? "" : v), children: [_jsx(SelectTrigger, { className: "w-[150px]", children: _jsx(SelectValue, { placeholder: "Filtrar status" }) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "all", children: "Todos" }), _jsx(SelectItem, { value: "pendente", children: "Pendente" }), _jsx(SelectItem, { value: "em_andamento", children: "Em Andamento" }), _jsx(SelectItem, { value: "concluido", children: "Conclu\u00EDdo" })] })] }), _jsxs(Dialog, { open: isDialogOpen, onOpenChange: setIsDialogOpen, children: [_jsx(DialogTrigger, { asChild: true, children: _jsxs(Button, { onClick: () => handleOpenDialog(), children: [_jsx(Plus, { className: "w-4 h-4 mr-2" }), "Nova Atividade"] }) }), _jsxs(DialogContent, { className: "max-w-lg", children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: editingAtividade ? 'Editar Atividade' : 'Nova Atividade' }), _jsx(DialogDescription, { children: "Crie uma atividade de leitura para um aluno" })] }), _jsxs("div", { className: "space-y-4 py-4", children: [_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "T\u00EDtulo da Atividade *" }), _jsx(Input, { value: formData.titulo, onChange: (e) => setFormData({ ...formData, titulo: e.target.value }), placeholder: "Ex: Resenha do livro Dom Casmurro" })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "Descri\u00E7\u00E3o" }), _jsx(Textarea, { value: formData.descricao, onChange: (e) => setFormData({ ...formData, descricao: e.target.value }), placeholder: "Instru\u00E7\u00F5es para o aluno...", rows: 3 })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "Aluno *" }), _jsxs(Select, { value: formData.aluno_id, onValueChange: (v) => setFormData({ ...formData, aluno_id: v }), children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, { placeholder: "Selecione" }) }), _jsx(SelectContent, { children: usuarios.map(u => (_jsxs(SelectItem, { value: u.id, children: [u.nome, " ", u.turma ? `(${u.turma})` : ''] }, u.id))) })] })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "Livro *" }), _jsxs(Select, { value: formData.livro_id, onValueChange: (v) => setFormData({ ...formData, livro_id: v }), children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, { placeholder: "Selecione" }) }), _jsx(SelectContent, { children: livros.map(l => (_jsx(SelectItem, { value: l.id, children: l.titulo }, l.id))) })] })] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "Pontos Extras" }), _jsx(Input, { type: "number", min: "0", value: formData.pontos_extras, onChange: (e) => setFormData({ ...formData, pontos_extras: parseInt(e.target.value) || 0 }) })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "Data de Entrega" }), _jsx(Input, { type: "date", value: formData.data_entrega, onChange: (e) => setFormData({ ...formData, data_entrega: e.target.value }) })] })] })] }), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx(Button, { variant: "outline", onClick: () => setIsDialogOpen(false), children: "Cancelar" }), _jsx(Button, { onClick: handleSave, disabled: saving, children: saving ? 'Salvando...' : 'Salvar' })] })] })] })] })] }) }), _jsx(CardContent, { children: loading ? (_jsx("p", { className: "text-center text-muted-foreground py-8", children: "Carregando..." })) : filteredAtividades.length === 0 ? (_jsx("p", { className: "text-center text-muted-foreground py-8", children: "Nenhuma atividade encontrada" })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs(Table, { children: [_jsx(TableHeader, { children: _jsxs(TableRow, { children: [_jsx(TableHead, { children: "Atividade" }), _jsx(TableHead, { children: "Aluno" }), _jsx(TableHead, { children: "Turma" }), _jsx(TableHead, { children: "Livro" }), _jsx(TableHead, { children: "Pontos" }), _jsx(TableHead, { children: "Entrega" }), _jsx(TableHead, { children: "Status" }), _jsx(TableHead, { className: "text-right", children: "A\u00E7\u00F5es" })] }) }), _jsx(TableBody, { children: filteredAtividades.map((atividade) => (_jsxs(TableRow, { children: [_jsx(TableCell, { className: "font-medium", children: atividade.titulo }), _jsx(TableCell, { children: atividade.usuarios_biblioteca?.nome || 'N/A' }), _jsx(TableCell, { children: atividade.usuarios_biblioteca?.turma || '-' }), _jsx(TableCell, { children: atividade.livros?.titulo || 'N/A' }), _jsx(TableCell, { children: _jsxs(Badge, { variant: "outline", className: "gap-1", children: [_jsx(Star, { className: "w-3 h-3" }), atividade.pontos_extras || 0] }) }), _jsx(TableCell, { children: atividade.data_entrega
                                                            ? format(new Date(atividade.data_entrega), "dd/MM/yyyy", { locale: ptBR })
                                                            : '-' }), _jsx(TableCell, { children: getStatusBadge(atividade.status) }), _jsx(TableCell, { className: "text-right", children: _jsxs("div", { className: "flex justify-end gap-1", children: [atividade.status !== 'concluido' && (_jsx(Button, { variant: "ghost", size: "icon", title: "Marcar como conclu\u00EDdo", onClick: () => handleUpdateStatus(atividade.id, 'concluido'), children: _jsx(CheckCircle, { className: "w-4 h-4 text-success" }) })), _jsx(Button, { variant: "ghost", size: "icon", onClick: () => handleOpenDialog(atividade), children: _jsx(Pencil, { className: "w-4 h-4" }) }), _jsx(Button, { variant: "ghost", size: "icon", onClick: () => handleDelete(atividade.id), children: _jsx(Trash2, { className: "w-4 h-4 text-destructive" }) })] }) })] }, atividade.id))) })] }) })) })] })] }) }));
}
