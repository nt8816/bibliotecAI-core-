import { Loader2 } from 'lucide-react';

export function AppShellState({
  title = 'Carregando...',
  description = 'Aguarde enquanto preparamos o ambiente.',
  loading = true,
  action = null,
}) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 rounded-lg bg-primary/10 p-2.5 text-primary">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <div className="h-5 w-5" />}
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}

