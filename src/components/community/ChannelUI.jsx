import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export function formatRelativeTime(value) {
  if (!value) return '';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const diffMs = Date.now() - date.getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'agora';
    if (minutes < 60) return `há ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `há ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'ontem';
    if (days < 7) return `há ${days} dias`;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  } catch {
    return '';
  }
}

export function getFileExtension(fileName) {
  const parts = String(fileName || '').split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

export function formatBytes(value) {
  const size = Number(value || 0);
  if (!size) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function ChannelTopBar({ eyebrow, title, description, action, meta, className }) {
  return (
    <div className={cn('rounded-[28px] border border-emerald-200/70 bg-[linear-gradient(135deg,rgba(236,253,245,0.95),rgba(255,255,255,0.98))] p-5 shadow-sm dark:border-emerald-900/50 dark:bg-[linear-gradient(135deg,rgba(6,78,59,0.25),rgba(15,23,42,0.92))]', className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          {eyebrow ? (
            <Badge className="w-fit rounded-full bg-emerald-600 px-3 py-1 text-white">
              {eyebrow}
            </Badge>
          ) : null}
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
            {description ? (
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          {meta}
          {action}
        </div>
      </div>
    </div>
  );
}

export function FeedCardShell({
  author,
  roleLabel,
  timeLabel,
  turmaLabel,
  title,
  children,
  actions,
  footer,
  className,
  accent = 'emerald',
}) {
  return (
    <article
      className={cn(
        'overflow-hidden rounded-[26px] border border-border/70 bg-card shadow-[0_10px_30px_rgba(15,23,42,0.04)] transition hover:shadow-[0_16px_36px_rgba(15,23,42,0.07)] dark:shadow-none',
        accent === 'emerald' && 'border-emerald-100/80 dark:border-emerald-900/40',
        className,
      )}
    >
      <header className="flex items-start gap-3 border-b border-border/50 bg-gradient-to-r from-emerald-500/8 via-background to-background px-5 py-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-600 text-sm font-bold text-white shadow-sm">
          {String(author || '?')
            .split(' ')
            .slice(0, 2)
            .map((part) => part[0])
            .join('')
            .toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{author || 'Equipe'}</p>
            {roleLabel ? <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[11px]">{roleLabel}</Badge> : null}
            {turmaLabel ? (
              <Badge variant="outline" className="rounded-full px-2 py-0.5 text-[11px]">
                {turmaLabel}
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{timeLabel}</p>
        </div>
        {actions}
      </header>

      {title ? (
        <div className="px-5 pt-4">
          <h2 className="text-lg font-semibold leading-snug text-slate-900 dark:text-slate-100">{title}</h2>
        </div>
      ) : null}

      {children ? <div className="space-y-4 px-5 py-4">{children}</div> : null}
      {footer ? <footer className="border-t border-border/50 bg-muted/30 px-5 py-3">{footer}</footer> : null}
    </article>
  );
}

export function ImageGrid({ images = [], onPreview, onDownload, emptyHidden = true }) {
  const list = (Array.isArray(images) ? images : []).filter(Boolean);
  if (list.length === 0 && emptyHidden) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {list.slice(0, 4).map((src, index) => (
        <div key={`${src}-${index}`} className="group relative overflow-hidden rounded-2xl border border-emerald-100 bg-emerald-50/40 dark:border-white/10 dark:bg-slate-900/50">
          <button
            type="button"
            className="block w-full"
            onClick={() => onPreview?.(src, index)}
            aria-label={`Abrir imagem ${index + 1}`}
          >
            <img src={src} alt={`Imagem ${index + 1}`} className="h-40 w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
          </button>
          {onDownload ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="absolute right-2 top-2 rounded-full bg-white/95 shadow-sm hover:bg-white dark:bg-slate-950/90"
              onClick={() => onDownload(src, index)}
            >
              Baixar
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function AttachmentList({ items = [], onDownload, onPreview, title = 'Anexos' }) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return null;

  return (
    <section className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3 dark:border-white/10 dark:bg-emerald-950/15">
      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-emerald-800/80 dark:text-emerald-200/80">{title}</p>
      <ul className="space-y-2">
        {list.map((arquivo, index) => {
          const nome = String(arquivo?.nome || arquivo?.name || 'Arquivo');
          const ext = String(arquivo?.extensao || getFileExtension(nome) || 'arq').toUpperCase();
          return (
            <li key={`${nome}-${index}`} className="flex items-center gap-3 rounded-xl border bg-card/90 px-3 py-2.5 shadow-sm dark:bg-slate-950/40">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                {ext.slice(0, 4)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{nome}</p>
                <p className="text-xs text-muted-foreground">
                  {ext} • {formatBytes(arquivo?.tamanho || arquivo?.size)}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                {onPreview ? (
                  <Button type="button" size="sm" variant="ghost" onClick={() => onPreview(arquivo)}>
                    Ver
                  </Button>
                ) : null}
                {onDownload ? (
                  <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => onDownload(arquivo)}>
                    Baixar
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ComposerSheet({ open, onOpenChange, title, description, children, footer, submitLabel, onSubmit, submitting, submitDisabled }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto rounded-[28px] border-emerald-200/70 p-0 dark:border-emerald-900/50">
        <DialogHeader className="border-b border-border/60 bg-gradient-to-r from-emerald-500/10 via-background to-background px-6 py-5">
          <DialogTitle className="text-xl font-semibold text-slate-900 dark:text-slate-100">{title}</DialogTitle>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </DialogHeader>
        <div className="space-y-4 px-6 py-5">{children}</div>
        {footer || onSubmit ? (
          <div className="flex items-center justify-end gap-2 border-t border-border/60 bg-muted/30 px-6 py-4">
            {footer}
            {onSubmit ? (
              <Button type="button" className="rounded-2xl bg-emerald-600 px-6 text-white hover:bg-emerald-700" onClick={onSubmit} disabled={submitting || submitDisabled}>
                {submitting ? 'Enviando...' : submitLabel || 'Publicar'}
              </Button>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function ChannelFab({ onClick, label, icon, visible }) {
  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-24 right-5 z-40 inline-flex h-14 items-center gap-2 rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(5,150,105,0.35)] transition hover:bg-emerald-700 active:scale-95 sm:bottom-8 sm:right-8"
      aria-label={label}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export function FeedSkeleton({ count = 3 }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="h-40 animate-pulse rounded-[26px] border bg-muted/40" />
      ))}
    </div>
  );
}
