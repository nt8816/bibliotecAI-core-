import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MessageSquareWarning } from 'lucide-react';

import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { AppSidebar } from './AppSidebar';
import { NotificationsPopover } from './NotificationsPopover';

export function MainLayout({ children, title }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAluno, isProfessor, isGestor, isBibliotecaria, isSuperAdmin, userRole } = useAuth();
  const canCreateComplaint = useMemo(
    () => (isAluno || isProfessor || isGestor || isBibliotecaria) && !isSuperAdmin,
    [isAluno, isBibliotecaria, isGestor, isProfessor, isSuperAdmin],
  );
  const isComplaintsPage = location.pathname === '/reclamacoes';

  return (
    <SidebarProvider>
      <div className="app-shell flex min-h-screen w-full bg-background">
        <a href="#main-content" className="skip-link">Pular para o conteúdo principal</a>
        <AppSidebar />

        <main className="flex min-w-0 flex-1 flex-col">
          <header
            className="main-shell-header sticky top-0 z-30 border-b bg-background/92 px-2.5 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4 sm:py-0"
            style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 0.85rem)' }}
          >
            <div className="flex min-h-14 flex-col justify-center gap-2 sm:h-16 sm:min-h-16 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2 sm:gap-4">
                <SidebarTrigger
                  className="h-11 w-11 shrink-0 rounded-2xl border border-border/70 bg-background/90 text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground sm:h-10 sm:w-10"
                  aria-label="Abrir ou fechar menu lateral"
                />
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground sm:hidden">
                    BibliotecAI
                  </p>
                  <h1 className="truncate text-base font-bold text-foreground sm:text-xl">{title}</h1>
                </div>
              </div>
              <div className="flex shrink-0 items-center justify-end gap-2">
                <NotificationsPopover userRole={userRole} />
                {canCreateComplaint && !isComplaintsPage && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 gap-2 rounded-full px-3 text-xs shadow-sm sm:h-9 sm:px-3 sm:text-sm"
                    onClick={() => navigate('/reclamacoes')}
                  >
                    <MessageSquareWarning className="h-4 w-4" />
                    <span className="hidden md:inline">Faça uma reclamação</span>
                    <span className="md:hidden">Reclamar</span>
                  </Button>
                )}
              </div>
            </div>
          </header>

          <div
            id="main-content"
            className="main-shell-content flex-1 overflow-auto px-3 py-3 sm:px-5 sm:py-5 lg:px-6 lg:py-6"
          >
            <div className="mx-auto w-full max-w-screen-2xl">
              {children}
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}


