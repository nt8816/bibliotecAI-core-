import {
  LayoutDashboard,
  BookOpen,
  Users,
  BookMarked,
  BarChart3,
  LogOut,
  Link as LinkIcon,
  School,
  GraduationCap,
  Lightbulb,
  MessageSquare,
  Building2,
  Bell,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/hooks/useAuth';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSystemNotifications } from '@/hooks/useSystemNotifications';

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const navigate = useNavigate();
  const { signOut, user, userRole, isGestor, isSuperAdmin } = useAuth();
  const { counts, canViewNotifications } = useSystemNotifications();
  const totalPendencias = counts.atrasados + counts.solicitacoesPendentes;
  const hasPendencias = totalPendencias > 0;

  const handleSignOut = async () => {
    await signOut();
  };

  const getMenuItems = () => {
    const commonItems = [{ title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard }];

    if (userRole === 'super_admin') {
      return [
        ...commonItems,
        { title: 'Tenants', url: '/admin/tenants', icon: Building2 },
      ];
    }

    if (userRole === 'gestor') {
      return [
        ...commonItems,
        { title: 'Livros', url: '/livros', icon: BookOpen },
        { title: 'Usuários', url: '/usuarios', icon: Users },
        { title: 'Empréstimos', url: '/emprestimos', icon: BookMarked },
        { title: 'Relatórios', url: '/relatorios', icon: BarChart3 },
        { title: 'Comunidade', url: '/comunidade', icon: MessageSquare },
      ];
    }

    if (userRole === 'bibliotecaria') {
      return [
        ...commonItems,
        { title: 'Livros', url: '/livros', icon: BookOpen },
        { title: 'Usuários', url: '/usuarios', icon: Users },
        { title: 'Empréstimos', url: '/emprestimos', icon: BookMarked },
        { title: 'Comunidade', url: '/comunidade', icon: MessageSquare },
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
      super_admin: { label: 'Super Admin', className: 'bg-destructive/20 text-destructive' },
      gestor: { label: 'Gestor', className: 'bg-primary/20 text-primary' },
      professor: { label: 'Professor', className: 'bg-info/20 text-info' },
      bibliotecaria: { label: 'Bibliotecária', className: 'bg-secondary/20 text-secondary' },
      aluno: { label: 'Aluno', className: 'bg-muted text-muted-foreground' },
    };

    return badges[userRole] || badges.aluno;
  };

  const getSidebarSubtitle = () => {
    if (userRole === 'super_admin') return 'Controle Global';
    if (userRole === 'gestor') return 'Painel do Gestor';
    if (userRole === 'professor') return 'Painel do Professor';
    if (userRole === 'bibliotecaria') return 'Painel da Biblioteca';
    if (userRole === 'aluno') return 'Painel do Aluno';
    return 'BibliotecAI';
  };

  return (
    <Sidebar className="border-r-0" collapsible="icon">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-sidebar-accent flex items-center justify-center overflow-hidden">
            <img src="/bibliotecai-symbol.svg" alt="BibliotecAI" className="w-7 h-7" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-bold text-lg text-sidebar-foreground">BibliotecAI</span>
              <span className="text-xs text-sidebar-foreground/70">{getSidebarSubtitle()}</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="p-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end className="sidebar-link" activeClassName="sidebar-link-active">
                      <item.icon className="w-5 h-5" />
                      {!collapsed && (
                        <div className="flex w-full items-center justify-between gap-2">
                          <span className="font-medium">{item.title}</span>
                          {item.url === '/emprestimos' && canViewNotifications && (counts.atrasados > 0 || counts.solicitacoesPendentes > 0) && (
                            <Badge className="h-5 min-w-5 px-1.5 text-[10px] leading-none">
                              {counts.atrasados + counts.solicitacoesPendentes}
                            </Badge>
                          )}
                        </div>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isGestor && !isSuperAdmin && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="text-sidebar-foreground/60">Administração</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {gestorMenuItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink to={item.url} end className="sidebar-link" activeClassName="sidebar-link-active">
                        <item.icon className="w-5 h-5" />
                        {!collapsed && <span className="font-medium">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        {!collapsed && user && (
          <div className="mb-3 px-2 space-y-2">
            <Badge className={getRoleBadge().className}>{getRoleBadge().label}</Badge>
            <p className="text-sm text-sidebar-foreground/70 truncate">{user.email}</p>
          </div>
        )}

        {canViewNotifications && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size={collapsed ? 'icon' : 'sm'}
                className={collapsed
                  ? 'relative mb-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  : 'relative mb-2 w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}
                aria-label="Abrir notificações"
              >
                <Bell className="w-5 h-5" />
                {!collapsed && <span>Notificações</span>}
                {hasPendencias && (
                  <span className="absolute -right-1 -top-1 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] leading-[1.1rem] text-center font-bold">
                    {totalPendencias > 99 ? '99+' : totalPendencias}
                  </span>
                )}
              </Button>
            </PopoverTrigger>

            <PopoverContent align="end" className="w-72">
              <div className="space-y-3">
                <div>
                  <p className="font-semibold text-sm">Notificações</p>
                  <p className="text-xs text-muted-foreground">Atualizado em tempo real</p>
                </div>

                {hasPendencias ? (
                  <div className="space-y-2">
                    <div className="rounded-md border p-2 text-sm flex items-center justify-between gap-2">
                      <span>Solicitações pendentes</span>
                      <Badge>{counts.solicitacoesPendentes}</Badge>
                    </div>
                    <div className="rounded-md border p-2 text-sm flex items-center justify-between gap-2">
                      <span>Empréstimos atrasados</span>
                      <Badge variant="destructive">{counts.atrasados}</Badge>
                    </div>
                    <Button size="sm" className="w-full" onClick={() => navigate('/emprestimos')}>
                      Abrir painel de empréstimos
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Sem pendências no momento.</p>
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}

        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={handleSignOut}
        >
          <LogOut className="w-5 h-5" />
          {!collapsed && <span>Sair</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
