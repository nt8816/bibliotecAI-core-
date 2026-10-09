import { FlaskConical, ImageIcon, ListChecks, Sparkles, Wand2 } from 'lucide-react';

import { CompactChannelHeader, formatRelativeTime } from '@/components/community/ChannelUI';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function LabHeader({ creationCount = 0, className, activeTool, onSelectTool }) {
  return (
    <div className={cn('space-y-3', className)}>
      <CompactChannelHeader
        icon="lab"
        title="Laboratório"
        meta={`${creationCount} criaç${creationCount === 1 ? 'ão' : 'ões'} salva${creationCount === 1 ? '' : 's'}`}
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <LabToolCard
          id="studio"
          icon={<ImageIcon className="h-4 w-4" />}
          title="Studio de imagens"
          description="Gerar e organizar imagens"
          active={activeTool === 'studio'}
          onClick={() => onSelectTool?.('studio')}
        />
        <LabToolCard
          id="quiz"
          icon={<ListChecks className="h-4 w-4" />}
          title="Quiz com IA"
          description="Criar quiz de leitura"
          active={activeTool === 'quiz'}
          onClick={() => onSelectTool?.('quiz')}
        />
        <LabToolCard
          id="resumo"
          icon={<Sparkles className="h-4 w-4" />}
          title="Resumo com IA"
          description="Resumir livros lidos"
          active={activeTool === 'resumo'}
          onClick={() => onSelectTool?.('resumo')}
        />
      </div>
    </div>
  );
}

function LabToolCard({ id, icon, title, description, active, onClick }) {
  return (
    <button
      type="button"
      aria-pressed={Boolean(active)}
      className={cn(
        'group rounded-full border px-4 py-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md',
        active
          ? 'border-emerald-400 bg-emerald-50/95 ring-2 ring-emerald-400/35 dark:border-emerald-400 dark:bg-emerald-950/50'
          : 'border-emerald-100/70 bg-card/90 dark:border-emerald-900/40 dark:bg-card/70',
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <div className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full text-white', active ? 'bg-emerald-600' : 'bg-emerald-600/85')}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">{title}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{description}</p>
        </div>
      </div>
    </button>
  );
}

export function LabSectionTitle({ id, icon, title, description, actions }) {
  return (
    <div id={id} className="scroll-mt-24 rounded-[24px] border border-border/60 bg-card px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
            {icon || <Wand2 className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
            {description ? (
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function LabCreationCard({ criacao, onOpen, onDelete, canDelete }) {
  const tipo = String(criacao?.tipo || 'criacao');
  const imagens = Array.isArray(criacao?.imagem_urls) ? criacao.imagem_urls.filter(Boolean) : [];
  const capa = imagens[0];

  const tipoLabel = {
    resumo: 'Resumo',
    quiz: 'Quiz',
    studio: 'Studio',
    imagem: 'Imagem',
  }[tipo] || tipo;

  return (
    <article className="group overflow-hidden rounded-[22px] border border-border/60 bg-card shadow-sm transition hover:shadow-md">
      <div className="relative h-36 bg-gradient-to-br from-emerald-500/15 via-emerald-50/50 to-slate-100 dark:from-emerald-950/40 dark:via-slate-900 dark:to-slate-950">
        {capa ? (
          <img src={capa} alt={criacao?.titulo || tipoLabel} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
        ) : (
          <div className="grid h-full place-items-center">
            <FlaskConical className="h-8 w-8 text-emerald-600/70" />
          </div>
        )}
        <Badge className="absolute left-3 top-3 rounded-full bg-emerald-600 text-white">{tipoLabel}</Badge>
      </div>
      <div className="space-y-2 p-3">
        <p className="line-clamp-2 text-sm font-medium text-slate-900 dark:text-slate-100">
          {criacao?.titulo || 'Criação do laboratório'}
        </p>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{formatRelativeTime(criacao?.created_at)}</p>
          <div className="flex gap-1">
            {onOpen ? (
              <Button type="button" size="sm" variant="outline" className="h-8 rounded-xl" onClick={() => onOpen(criacao)}>
                Abrir
              </Button>
            ) : null}
            {canDelete && onDelete ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 rounded-xl text-destructive hover:text-destructive"
                onClick={() => onDelete(criacao)}
              >
                Apagar
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
