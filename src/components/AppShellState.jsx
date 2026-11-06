import { BookOpen } from 'lucide-react';
import { LoadingIndicator } from '@/components/LoadingIndicator';

export function AppShellState({
  title = 'Carregando...',
  description = 'Aguarde enquanto preparamos o ambiente.',
  loading = true,
  action = null,
}) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="app-loading-panel w-full max-w-md rounded-3xl border border-primary/15 bg-card p-8 shadow-lg shadow-primary/5">
        <div className="flex flex-col items-center gap-5 text-center" role={loading ? 'status' : undefined} aria-atomic={loading ? true : undefined}>
          {loading ? <LoadingIndicator /> : <BookOpen className="h-10 w-10 text-primary" aria-hidden="true" />}
          <div className="space-y-2">
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
          </div>
        </div>
        {loading ? <div className="app-loading-track mt-6" aria-hidden="true"><span /></div> : null}
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}

