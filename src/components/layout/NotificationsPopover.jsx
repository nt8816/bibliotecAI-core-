import { Bell } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSystemNotifications } from '@/hooks/useSystemNotifications';

function buildItems({ notifications, counts, userRole, unreadChatNotifications }) {
  const items = [];
  if (notifications.length > 0) {
    items.push(
      ...notifications.slice(0, 8).map((item) => ({
        key: item.id,
        label: item.titulo,
        description: item.descricao,
        badge: 'Novo',
        badgeVariant: 'destructive',
        onClick: () => ({ type: 'notification', id: item.id, path: item.path }),
      })),
    );
  }
  if (userRole === 'super_admin' && counts.reclamacoes > 0) {
    items.push({
      key: 'reclamacoes',
      label: 'Reclamações novas',
      badge: counts.reclamacoes,
      path: '/reclamacoes',
    });
  }
  if (unreadChatNotifications > 0) {
    items.push({
      key: 'chat',
      label: 'Mensagens não lidas',
      badge: unreadChatNotifications,
      path: userRole === 'aluno' ? '/aluno/mensagens' : '/mensagens',
    });
  }
  if (counts.solicitacoesPendentes > 0) {
    items.push({
      key: 'solicitacoes',
      label: 'Solicitações pendentes',
      badge: counts.solicitacoesPendentes,
      path: userRole === 'aluno' ? '/aluno/mensagens' : '/mensagens',
    });
  }
  if (counts.atrasados > 0) {
    items.push({
      key: 'atrasos',
      label: 'Empréstimos atrasados',
      badge: counts.atrasados,
      badgeVariant: 'destructive',
      path: userRole === 'aluno' ? '/aluno/biblioteca' : '/emprestimos?tab=ativos&status=atrasados',
    });
  }
  return items;
}

function NotificationList({ items, onAction, emptyLabel }) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className="flex w-full items-start gap-3 rounded-2xl border border-border/60 bg-card px-3 py-3 text-left transition hover:bg-accent/60"
          onClick={() => onAction(item)}
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{item.label}</p>
            {item.description ? (
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
            ) : null}
          </div>
          {item.badge ? (
            <Badge variant={item.badgeVariant || 'secondary'} className="shrink-0 rounded-full">
              {item.badge}
            </Badge>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function NotificationsPopover({ userRole, onNavigate }) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const { counts, notifications, canViewNotifications, markNotificationRead } = useSystemNotifications();
  const unreadChatNotifications = notifications.filter((item) => item?.tipo === 'solicitacao_chat').length;
  const hasAtrasoNotification = notifications.some((item) => item?.tipo === 'atraso');
  const hasComunicadoNotification = notifications.some((item) => item?.tipo === 'comunicado');

  const totalPendencias = notifications.length
    + (hasAtrasoNotification ? 0 : counts.atrasados)
    + (hasComunicadoNotification ? 0 : counts.comunicados)
    + counts.solicitacoesPendentes
    + (counts.reclamacoes || 0)
    + (counts.seguranca || 0);
  const hasPendencias = totalPendencias > 0;
  const hasUnreadComunicados = counts.comunicados > 0 || (counts.seguranca || 0) > 0;

  if (!canViewNotifications) {
    return null;
  }

  const items = buildItems({ notifications, counts, userRole, unreadChatNotifications });

  const handleNavigate = (path) => {
    navigate(path);
    setOpen(false);
    onNavigate?.();
  };

  const handleAction = async (item) => {
    if (item.onClick) {
      const meta = item.onClick();
      if (meta?.id) {
        await markNotificationRead(meta.id);
      }
      const fallbackPath = userRole === 'aluno' ? '/aluno/comunicados' : '/comunicados';
      const rawPath = String(meta?.path || item.path || '').trim();
      const normalizedPath = userRole === 'aluno' && rawPath.startsWith('/comunicados')
        ? rawPath.replace('/comunicados', '/aluno/comunicados')
        : rawPath;
      handleNavigate(normalizedPath || fallbackPath);
      return;
    }
    if (item.path) {
      handleNavigate(item.path);
    }
  };

  const bellButton = (
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
      {hasPendencias ? (
        <span className="absolute -right-1 -top-1 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] leading-[1.1rem] text-center font-bold">
          {totalPendencias > 99 ? '99+' : totalPendencias}
        </span>
      ) : null}
    </Button>
  );

  if (isMobile) {
    return (
      <>
        <span onClick={() => setOpen(true)} className="inline-flex">
          {bellButton}
        </span>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            side="bottom"
            className="max-h-[55vh] overflow-y-auto rounded-t-[28px] border-t border-emerald-200/70 px-4 pb-8 pt-5 dark:border-emerald-900/50"
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-muted-foreground/30" aria-hidden />
            <SheetHeader className="mb-3 space-y-1 text-left">
              <SheetTitle className="text-base font-semibold">Notificações</SheetTitle>
              <SheetDescription>Atualizado em tempo real</SheetDescription>
            </SheetHeader>
            <NotificationList items={items} onAction={handleAction} emptyLabel="Sem pendências no momento." />
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{bellButton}</PopoverTrigger>
      <PopoverContent align="end" className="w-80 rounded-2xl border-emerald-100/70 p-3 dark:border-emerald-900/40">
        <div className="mb-3">
          <p className="text-sm font-semibold">Notificações</p>
          <p className="text-xs text-muted-foreground">Atualizado em tempo real</p>
        </div>
        <NotificationList items={items} onAction={handleAction} emptyLabel="Sem pendências no momento." />
      </PopoverContent>
    </Popover>
  );
}
