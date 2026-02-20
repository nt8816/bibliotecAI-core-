import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { School, Plus, Trash2, GraduationCap, BookOpen, Loader2 } from 'lucide-react';
export default function ConfiguracaoEscola() {
    const [escola, setEscola] = useState(null);
    const [salas, setSalas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [nomeEscola, setNomeEscola] = useState('');
    const [novaSala, setNovaSala] = useState('');
    const [tipoNovaSala, setTipoNovaSala] = useState('sala');
    const [dialogOpen, setDialogOpen] = useState(false);
    const { toast } = useToast();
    const { user } = useAuth();
    const fetchEscola = useCallback(async () => {
        if (!user)
            return;
        try {
            // Fetch escola
            const { data: escolaData, error: escolaError } = await supabase
                .from('escolas')
                .select('*')
                .eq('gestor_id', user.id)
                .maybeSingle();
            if (escolaError)
                throw escolaError;
            if (escolaData) {
                setEscola(escolaData);
                setNomeEscola(escolaData.nome);
                // Fetch salas/cursos
                const { data: salasData, error: salasError } = await supabase
                    .from('salas_cursos')
                    .select('*')
                    .eq('escola_id', escolaData.id)
                    .order('nome');
                if (salasError)
                    throw salasError;
                setSalas((salasData || []));
            }
        }
        catch (error) {
            console.error('Error fetching escola:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível carregar os dados da escola.',
                variant: 'destructive',
            });
        }
        finally {
            setLoading(false);
        }
    }, [user, toast]);
    useEffect(() => {
        fetchEscola();
    }, [fetchEscola]);
    const salvarEscola = async () => {
        if (!user || !nomeEscola.trim())
            return;
        setSaving(true);
        try {
            if (escola) {
                // Update existing escola
                const { error } = await supabase
                    .from('escolas')
                    .update({ nome: nomeEscola })
                    .eq('id', escola.id);
                if (error)
                    throw error;
                setEscola({ ...escola, nome: nomeEscola });
            }
            else {
                // Create new escola
                const { data, error } = await supabase
                    .from('escolas')
                    .insert({ nome: nomeEscola, gestor_id: user.id })
                    .select()
                    .single();
                if (error)
                    throw error;
                setEscola(data);
            }
            toast({
                title: 'Salvo!',
                description: 'As informações da escola foram atualizadas.',
            });
        }
        catch (error) {
            console.error('Error saving escola:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível salvar as informações.',
                variant: 'destructive',
            });
        }
        finally {
            setSaving(false);
        }
    };
    const adicionarSala = async () => {
        if (!escola || !novaSala.trim())
            return;
        try {
            const { data, error } = await supabase
                .from('salas_cursos')
                .insert({
                escola_id: escola.id,
                nome: novaSala,
                tipo: tipoNovaSala,
            })
                .select()
                .single();
            if (error)
                throw error;
            setSalas([...salas, data]);
            setNovaSala('');
            setDialogOpen(false);
            toast({
                title: 'Adicionado!',
                description: `${tipoNovaSala === 'sala' ? 'Sala' : 'Curso'} adicionado com sucesso.`,
            });
        }
        catch (error) {
            console.error('Error adding sala:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível adicionar.',
                variant: 'destructive',
            });
        }
    };
    const removerSala = async (id) => {
        try {
            const { error } = await supabase
                .from('salas_cursos')
                .delete()
                .eq('id', id);
            if (error)
                throw error;
            setSalas(salas.filter(s => s.id !== id));
            toast({
                title: 'Removido!',
                description: 'Item removido com sucesso.',
            });
        }
        catch (error) {
            console.error('Error removing sala:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível remover.',
                variant: 'destructive',
            });
        }
    };
    if (loading) {
        return (_jsx(MainLayout, { title: "Configura\u00E7\u00E3o da Escola", children: _jsx("div", { className: "flex items-center justify-center py-12", children: _jsx(Loader2, { className: "w-8 h-8 animate-spin text-primary" }) }) }));
    }
    return (_jsx(MainLayout, { title: "Configura\u00E7\u00E3o da Escola", children: _jsxs("div", { className: "space-y-6 max-w-3xl mx-auto", children: [_jsxs(Card, { children: [_jsxs(CardHeader, { children: [_jsxs(CardTitle, { className: "flex items-center gap-2", children: [_jsx(School, { className: "w-5 h-5" }), "Informa\u00E7\u00F5es da Escola"] }), _jsx(CardDescription, { children: "Configure o nome e informa\u00E7\u00F5es b\u00E1sicas da sua escola" })] }), _jsxs(CardContent, { className: "space-y-4", children: [_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "nomeEscola", children: "Nome da Escola" }), _jsx(Input, { id: "nomeEscola", value: nomeEscola, onChange: (e) => setNomeEscola(e.target.value), placeholder: "Ex: Escola Estadual ABC" })] }), _jsx(Button, { onClick: salvarEscola, disabled: saving, children: saving ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "w-4 h-4 mr-2 animate-spin" }), "Salvando..."] })) : ('Salvar') })] })] }), _jsxs(Card, { children: [_jsxs(CardHeader, { className: "flex flex-row items-center justify-between", children: [_jsxs("div", { children: [_jsxs(CardTitle, { className: "flex items-center gap-2", children: [_jsx(GraduationCap, { className: "w-5 h-5" }), "Salas e Cursos"] }), _jsx(CardDescription, { children: "Adicione as turmas/salas ou cursos t\u00E9cnicos da escola" })] }), _jsxs(Dialog, { open: dialogOpen, onOpenChange: setDialogOpen, children: [_jsx(DialogTrigger, { asChild: true, children: _jsxs(Button, { disabled: !escola, children: [_jsx(Plus, { className: "w-4 h-4 mr-2" }), "Adicionar"] }) }), _jsxs(DialogContent, { children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: "Adicionar Sala/Curso" }) }), _jsxs("div", { className: "space-y-4 pt-4", children: [_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "Tipo" }), _jsxs(Select, { value: tipoNovaSala, onValueChange: (v) => setTipoNovaSala(v), children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, {}) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "sala", children: "Sala/Turma" }), _jsx(SelectItem, { value: "curso_tecnico", children: "Curso T\u00E9cnico" })] })] })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "Nome" }), _jsx(Input, { value: novaSala, onChange: (e) => setNovaSala(e.target.value), placeholder: tipoNovaSala === 'sala' ? 'Ex: 3º Ano A' : 'Ex: Técnico em Informática' })] }), _jsx(Button, { onClick: adicionarSala, className: "w-full", children: "Adicionar" })] })] })] })] }), _jsx(CardContent, { children: !escola ? (_jsx("p", { className: "text-muted-foreground text-center py-8", children: "Salve as informa\u00E7\u00F5es da escola primeiro para adicionar salas e cursos." })) : salas.length === 0 ? (_jsxs("div", { className: "text-center py-8", children: [_jsx(BookOpen, { className: "w-12 h-12 mx-auto text-muted-foreground/50 mb-4" }), _jsx("p", { className: "text-muted-foreground", children: "Nenhuma sala ou curso cadastrado" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "Clique em \"Adicionar\" para come\u00E7ar" })] })) : (_jsx("div", { className: "space-y-2", children: salas.map((sala) => (_jsxs("div", { className: "flex items-center justify-between p-3 rounded-lg bg-muted/50", children: [_jsxs("div", { className: "flex items-center gap-3", children: [sala.tipo === 'sala' ? (_jsx(GraduationCap, { className: "w-5 h-5 text-primary" })) : (_jsx(BookOpen, { className: "w-5 h-5 text-secondary" })), _jsx("span", { className: "font-medium", children: sala.nome }), _jsx(Badge, { variant: "outline", className: "text-xs", children: sala.tipo === 'sala' ? 'Sala' : 'Curso Técnico' })] }), _jsx(Button, { variant: "ghost", size: "sm", onClick: () => removerSala(sala.id), children: _jsx(Trash2, { className: "w-4 h-4 text-destructive" }) })] }, sala.id))) })) })] })] }) }));
}
