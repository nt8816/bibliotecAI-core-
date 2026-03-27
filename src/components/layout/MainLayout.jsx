import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MessageSquareWarning } from 'lucide-react';

import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { AppSidebar } from './AppSidebar';

export function MainLayout({ children, title }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAluno, isProfessor, isGestor, isBibliotecaria, isSuperAdmin } = useAuth();
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
            className="main-shell-header sticky top-0 z-30 flex min-h-14 items-center justify-between gap-3 border-b px-3 py-2 sm:h-16 sm:min-h-16 sm:gap-4 sm:px-4 sm:py-0"
            style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 0.85rem)' }}
          >
            <div className="flex min-w-0 items-center gap-3 pt-2 sm:gap-4 sm:pt-0">
              <SidebarTrigger
                className="mt-3 h-14 w-14 shrink-0 rounded-2xl border border-border/70 bg-background/90 text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground sm:mt-0 sm:h-10 sm:w-10 sm:rounded-2xl"
                aria-label="Abrir ou fechar menu lateral"
              />
              <div className="min-w-0">
                <h1 className="truncate text-base font-bold text-foreground sm:text-xl">{title}</h1>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {canCreateComplaint && !isComplaintsPage && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 gap-2 rounded-full px-3 text-xs sm:text-sm"
                  onClick={() => navigate('/reclamacoes')}
                >
                  <MessageSquareWarning className="h-4 w-4" />
                  <span className="hidden sm:inline">Faça uma reclamação</span>
                </Button>
              )}
            </div>
          </header>

          <div
            id="main-content"
            className="main-shell-content flex-1 overflow-auto px-3 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6"
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


