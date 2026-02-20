import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useLocation } from 'react-router-dom';
import { LayoutDashboard, BookOpen, Users, BookMarked, BarChart3, LogOut, Link as LinkIcon, School, GraduationCap, Lightbulb, MessageSquare, } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/hooks/useAuth';
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar, } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
export function AppSidebar() {
    const { state } = useSidebar();
    const collapsed = state === 'collapsed';
    const location = useLocation();
    const { signOut, user, userRole, isGestor, isProfessor } = useAuth();
    const handleSignOut = async () => {
        await signOut();
    };
    const getMenuItems = () => {
        const commonItems = [
            { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
        ];
        if (userRole === 'gestor') {
            return [
                ...commonItems,
                { title: 'Livros', url: '/livros', icon: BookOpen },
                { title: 'Usuários', url: '/usuarios', icon: Users },
                { title: 'Empréstimos', url: '/emprestimos', icon: BookMarked },
                { title: 'Relatórios', url: '/relatorios', icon: BarChart3 },
            ];
        }
        if (userRole === 'bibliotecaria') {
            return [
                ...commonItems,
                { title: 'Livros', url: '/livros', icon: BookOpen },
                { title: 'Usuários', url: '/usuarios', icon: Users },
                { title: 'Empréstimos', url: '/emprestimos', icon: BookMarked },
            ];
        }
        if (userRole === 'professor') {
            return [
                ...commonItems,
                { title: 'Livros', url: '/livros', icon: BookOpen },
                { title: 'Meus Alunos', url: '/professor/alunos', icon: GraduationCap },
                { title: 'Sugestões e Atividades', url: '/professor/painel', icon: Lightbulb },
                { title: 'Relatórios de Leitura', url: '/professor/relatorios', icon: BarChart3 },
            ];
        }
        // Aluno
        return [
            { title: 'Meu Painel', url: '/aluno/painel', icon: BookOpen },
            { title: 'Comunidade', url: '/aluno/comunidade', icon: MessageSquare },
        ];
    };
    const gestorMenuItems = [
        { title: 'Configuração da Escola', url: '/configuracao-escola', icon: School },
        { title: 'Tokens de Convite', url: '/tokens', icon: LinkIcon },
    ];
    const menuItems = getMenuItems();
    const getRoleBadge = () => {
        if (!userRole) {
            return { label: 'Carregando...', className: 'bg-muted/50 text-muted-foreground animate-pulse' };
        }
        const badges = {
            gestor: { label: 'Gestor', className: 'bg-primary/20 text-primary' },
            professor: { label: 'Professor', className: 'bg-info/20 text-info' },
            bibliotecaria: { label: 'Bibliotecária', className: 'bg-secondary/20 text-secondary' },
            aluno: { label: 'Aluno', className: 'bg-muted text-muted-foreground' },
        };
        return badges[userRole] || badges.aluno;
    };
    const getSidebarSubtitle = () => {
        if (userRole === 'gestor')
            return 'Painel do Gestor';
        if (userRole === 'professor')
            return 'Painel do Professor';
        if (userRole === 'bibliotecaria')
            return 'Painel da Biblioteca';
        if (userRole === 'aluno')
            return 'Painel do Aluno';
        return 'Sistema Escolar';
    };
    return (_jsxs(Sidebar, { className: "border-r-0", collapsible: "icon", children: [_jsx(SidebarHeader, { className: "p-4 border-b border-sidebar-border", children: _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "w-10 h-10 rounded-lg bg-sidebar-accent flex items-center justify-center overflow-hidden", children: _jsx("img", { src: "/bibliotecai-symbol.svg", alt: "BibliotecAI", className: "w-7 h-7" }) }), !collapsed && (_jsxs("div", { className: "flex flex-col", children: [_jsx("span", { className: "font-bold text-lg text-sidebar-foreground", children: "BibliotecAI" }), _jsx("span", { className: "text-xs text-sidebar-foreground/70", children: getSidebarSubtitle() })] }))] }) }), _jsxs(SidebarContent, { className: "p-2", children: [_jsx(SidebarGroup, { children: _jsx(SidebarGroupContent, { children: _jsx(SidebarMenu, { children: menuItems.map((item) => (_jsx(SidebarMenuItem, { children: _jsx(SidebarMenuButton, { asChild: true, children: _jsxs(NavLink, { to: item.url, end: true, className: "sidebar-link", activeClassName: "sidebar-link-active", children: [_jsx(item.icon, { className: "w-5 h-5" }), !collapsed && _jsx("span", { className: "font-medium", children: item.title })] }) }) }, item.title))) }) }) }), isGestor && (_jsxs(SidebarGroup, { children: [!collapsed && _jsx(SidebarGroupLabel, { className: "text-sidebar-foreground/60", children: "Administra\u00E7\u00E3o" }), _jsx(SidebarGroupContent, { children: _jsx(SidebarMenu, { children: gestorMenuItems.map((item) => (_jsx(SidebarMenuItem, { children: _jsx(SidebarMenuButton, { asChild: true, children: _jsxs(NavLink, { to: item.url, end: true, className: "sidebar-link", activeClassName: "sidebar-link-active", children: [_jsx(item.icon, { className: "w-5 h-5" }), !collapsed && _jsx("span", { className: "font-medium", children: item.title })] }) }) }, item.title))) }) })] }))] }), _jsxs(SidebarFooter, { className: "p-4 border-t border-sidebar-border", children: [!collapsed && user && (_jsxs("div", { className: "mb-3 px-2 space-y-2", children: [_jsx(Badge, { className: getRoleBadge().className, children: getRoleBadge().label }), _jsx("p", { className: "text-sm text-sidebar-foreground/70 truncate", children: user.email })] })), _jsxs(Button, { variant: "ghost", className: "w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", onClick: handleSignOut, children: [_jsx(LogOut, { className: "w-5 h-5" }), !collapsed && _jsx("span", { children: "Sair" })] })] })] }));
}
