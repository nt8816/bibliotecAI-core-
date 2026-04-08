import {
  LayoutDashboard,
  BookOpen,
  Users,
  BookMarked,
  FlaskConical,
  BarChart3,
  Trophy,
  LogOut,
  Link as LinkIcon,
  School,
  GraduationCap,
  Lightbulb,
  MessageSquare,
  FileStack,
  Building2,
  Bell,
  Settings,
  ShieldCheck,
  ClipboardList,
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
import { useSystemNotifications } from '@/hooks/useSystemNotifications';

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === 'collapsed';
  const navigate = useNavigate();
  const { signOut, user, userRole, isGestor, isBibliotecaria, isSuperAdmin } = useAuth();
  const { counts, canViewNotifications } = useSystemNotifications();
  const settingsPath = '/configuracoes';
  const isTempLoginEmail = /@temp\.bibliotecai\.com$/i.test(String(user?.email || ''));
  const visibleUserIdentity = isTempLoginEmail
    ? (user?.user_metadata?.nome || 'Usuário')
    : (user?.email || 'Usuário');

  const handleSignOut = async () => {
    await signOut();
  };
  const handleMenuItemClick = () => {
    if (isMobile) setOpenMobile(false);
  };
  const getMenuItems = () => {
    const commonItems = [{ title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard }];

    if (userRole === 'super_admin') {
      return [
        ...commonItems,
        { title: 'Tenants', url: '/admin/tenants', icon: Building2 },
        { title: 'Super Admins', url: '/admin/super-admins', icon: ShieldCheck },
        { title: 'Reclamacoes', url: '/reclamacoes', icon: Bell },
      ];
    }

    if (userRole === 'gestor') {
      return [
        ...commonItems,
        { title: 'Livros', url: '/livros', icon: BookOpen },
        { title: 'Usuários', url: '/usuarios', icon: Users },
        { title: 'Relatórios', url: '/relatorios', icon: BarChart3 },
        { title: 'Comunicados', url: '/comunicados', icon: Bell },
        { title: 'Comunidade', url: '/comunidade', icon: MessageSquare },
        { title: 'Ranking', url: '/ranking', icon: Trophy },
      ];
    }

    if (userRole === 'bibliotecaria') {
      return [
        ...commonItems,
        { title: 'Livros', url: '/livros', icon: BookOpen },
        { title: 'Usuários', url: '/usuarios', icon: Users },
        { title: 'Empréstimos', url: '/emprestimos', icon: BookMarked },
        { title: 'Comunicados', url: '/comunicados', icon: Bell },
        { title: 'Comunidade', url: '/comunidade', icon: MessageSquare },
        { title: 'Ranking', url: '/ranking', icon: Trophy },
      ];
    }

    if (userRole === 'professor') {
      return [
        { title: 'Dashboard', url: '/professor/dashboard', icon: LayoutDashboard },
        { title: 'Livros', url: '/livros', icon: BookOpen },
        { title: 'Meus Alunos', url: '/professor/alunos', icon: GraduationCap },
        { title: 'Sugestões e Atividades', url: '/professor/painel', icon: Lightbulb },
        { title: 'Relatórios de Leitura', url: '/professor/relatorios', icon: BarChart3 },
        { title: 'Comunicados', url: '/comunicados', icon: Bell },
        { title: 'Comunidade', url: '/comunidade', icon: MessageSquare },
        { title: 'Arquivos de Aula', url: '/arquivos-de-aula', icon: FileStack },
        { title: 'Ranking', url: '/ranking', icon: Trophy },
      ];
    }

    return [
      { title: 'Meu Perfil', url: '/aluno/perfil', icon: LayoutDashboard },
      { title: 'Biblioteca', url: '/aluno/biblioteca', icon: BookOpen },
      { title: 'Laboratório', url: '/aluno/laboratorio', icon: FlaskConical },
      { title: 'Atividades', url: '/aluno/atividades', icon: ClipboardList },
      { title: 'Comunicados', url: '/aluno/comunicados', icon: Bell },
      { title: 'Comunidade', url: '/aluno/comunidade', icon: MessageSquare },
      { title: 'Arquivos de Aula', url: '/aluno/arquivos-de-aula', icon: FileStack },
      { title: 'Ranking', url: '/aluno/ranking', icon: Trophy },
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
    <Sidebar className="border-r-0 bg-transparent" collapsible="icon">
      <SidebarHeader className={`${collapsed ? 'p-2' : 'p-4'} border-b border-sidebar-border/80 bg-sidebar/95 backdrop-blur`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
          <div className={`${collapsed ? 'w-8 h-8 rounded-[1.1rem]' : 'w-11 h-11 rounded-[1.4rem]'} bg-gradient-to-br from-sidebar-accent to-sidebar-primary/40 ring-1 ring-sidebar-border shadow-[0_12px_24px_rgba(0,0,0,0.18)] flex items-center justify-center overflow-hidden p-0.5`}>
            <img src="/app-logo.png" alt="BibliotecAI" className={`${collapsed ? 'w-7 h-7' : 'w-10 h-10'} rounded-[1rem] object-cover`} />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-bold text-lg text-sidebar-foreground">BibliotecAI</span>
              <span className="text-xs text-sidebar-foreground/70">{getSidebarSubtitle()}</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className={`${collapsed ? 'p-1' : 'p-2'} bg-sidebar/95 backdrop-blur`}>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      onClick={handleMenuItemClick}
                      className={`flex min-w-0 items-center transition-all duration-200 ${collapsed ? 'mx-auto size-9 justify-center rounded-xl' : 'h-11 w-full gap-3 rounded-2xl px-3'} hover:translate-x-1`}
                      activeClassName="rounded-2xl bg-sidebar-accent text-sidebar-accent-foreground shadow-[0_12px_24px_rgba(0,0,0,0.16)]"
                    >
                      <span className={`${collapsed ? '' : 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sidebar-accent/60 ring-1 ring-sidebar-border shadow-sm'}`}>
                        <item.icon className="w-4 h-4" />
                      </span>
                      {!collapsed && (
                        <div className="flex w-full items-center justify-between gap-2">
                          <span className="font-medium text-[15px] leading-none">{item.title}</span>
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
                      <NavLink
                        to={item.url}
                        end
                        onClick={handleMenuItemClick}
                        className={`flex min-w-0 items-center transition-all duration-200 ${collapsed ? 'mx-auto size-9 justify-center rounded-xl' : 'h-11 w-full gap-3 rounded-2xl px-3'} hover:translate-x-1`}
                        activeClassName="rounded-2xl bg-sidebar-accent text-sidebar-accent-foreground shadow-[0_12px_24px_rgba(0,0,0,0.16)]"
                      >
                        <span className={`${collapsed ? '' : 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sidebar-accent/60 ring-1 ring-sidebar-border shadow-sm'}`}>
                          <item.icon className="w-4 h-4" />
                        </span>
                        {!collapsed && <span className="font-medium text-[15px] leading-none">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className={`${collapsed ? 'p-2' : 'p-4'} border-t border-sidebar-border/80 bg-sidebar/95 backdrop-blur`}>
        {!collapsed && user && (
          <div className="mb-3 px-2 space-y-2">
            <Badge className={getRoleBadge().className}>{getRoleBadge().label}</Badge>
            <p className="text-sm text-sidebar-foreground/70 truncate">{visibleUserIdentity}</p>
          </div>
        )}

        <div className={collapsed ? 'space-y-2' : 'space-y-2'}>
          <Button
            type="button"
            variant="ghost"
            size={collapsed ? 'icon' : 'sm'}
            className={collapsed
              ? 'mx-auto text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              : 'h-9 w-full justify-start gap-2.5 rounded-lg px-2.5 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}
            onClick={() => navigate(settingsPath)}
            aria-label="Abrir configurações"
          >
            <Settings className="size-4 sm:size-5" />
            {!collapsed && <span className="truncate text-xs sm:text-sm">Configurações</span>}
          </Button>
        </div>

        <Button
          variant="ghost"
          size={collapsed ? 'icon' : 'default'}
          className={collapsed
            ? 'mx-auto mt-2 justify-center text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            : 'mt-2 h-10 w-full justify-start gap-3 rounded-lg px-2.5 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}
          onClick={handleSignOut}
        >
          <LogOut className="size-4 sm:size-5" />
          {!collapsed && <span>Sair</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}


