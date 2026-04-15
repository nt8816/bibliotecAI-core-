import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSystemNotifications } from '@/hooks/useSystemNotifications';

export function NotificationsPopover({ userRole, onNavigate }) {
  const navigate = useNavigate();
  const { counts, notifications, canViewNotifications, markNotificationRead } = useSystemNotifications();

  const totalPendencias = counts.atrasados
    + counts.solicitacoesPendentes
    + counts.comunicados
    + (counts.reclamacoes || 0)
    + (counts.seguranca || 0);
  const hasPendencias = totalPendencias > 0;
  const hasUnreadComunicados = counts.comunicados > 0 || (counts.seguranca || 0) > 0;

  if (!canViewNotifications) {
    return null;
  }

  const handleNavigate = (path) => {
    navigate(path);
    onNavigate?.();
  };

  const handleNotificationClick = async (item) => {
    if (item?.id) {
      await markNotificationRead(item.id);
    }

    const fallbackPath = userRole === 'aluno' ? '/aluno/comunicados' : '/comunicados';
    handleNavigate(item?.path || fallbackPath);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={`relative h-10 w-10 rounded-full border border-border/70 bg-background/90 text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground ${
            hasUnreadComunicados ? 'bg-amber-500/15 text-amber-100 ring-1 ring-amber-400/60 shadow-[0_0_16px_rgba(251,191,36,0.22)]' : ''
          }`}
          aria-label="Abrir notificações"
        >
          <Bell className={`size-4 sm:size-5 ${hasUnreadComunicados ? 'text-amber-300' : ''}`} />
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
              {notifications.length > 0 && (
                <>
                  {notifications.slice(0, 5).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="w-full rounded-md border p-2 text-sm flex items-start justify-between gap-2 text-left hover:bg-accent transition-colors"
                      onClick={() => handleNotificationClick(item)}
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">{item.titulo}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">{item.descricao}</p>
                      </div>
                      <Badge variant="destructive">Novo</Badge>
                    </button>
                  ))}
                </>
              )}
              {userRole === 'super_admin' && counts.reclamacoes > 0 && (
                <button
                  type="button"
                  className="w-full rounded-md border p-2 text-sm flex items-center justify-between gap-2 text-left hover:bg-accent transition-colors"
                  onClick={() => handleNavigate('/reclamacoes')}
                >
                  <span>Reclamacoes novas</span>
                  <Badge>{counts.reclamacoes}</Badge>
                </button>
              )}
              {counts.solicitacoesPendentes > 0 && (
                <button
                  type="button"
                  className="w-full rounded-md border p-2 text-sm flex items-center justify-between gap-2 text-left hover:bg-accent transition-colors"
                  onClick={() => handleNavigate(userRole === 'aluno' ? '/aluno/mensagens' : '/mensagens')}
                >
                  <span>Solicitações pendentes</span>
                  <Badge>{counts.solicitacoesPendentes}</Badge>
                </button>
              )}
              {counts.atrasados > 0 && (
                <button
                  type="button"
                  className="w-full rounded-md border p-2 text-sm flex items-center justify-between gap-2 text-left hover:bg-accent transition-colors"
                  onClick={() => handleNavigate(userRole === 'aluno' ? '/aluno/biblioteca' : '/emprestimos?tab=ativos&status=atrasados')}
                >
                  <span>Empréstimos atrasados</span>
                  <Badge variant="destructive">{counts.atrasados}</Badge>
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sem pendências no momento.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
