import { Building2, AlertTriangle } from 'lucide-react';

export default function TenantNotFound() {
  const hostname = window.location.hostname;

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <div className="max-w-lg w-full rounded-xl border bg-card p-6 text-center space-y-4">
        <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-destructive" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Escola não encontrada</h1>
          <p className="text-muted-foreground">
            O subdomínio <strong>{hostname}</strong> não está cadastrado no BibliotecAI.
          </p>
          <p className="text-sm text-muted-foreground">
            Verifique o endereço ou solicite o provisionamento para o administrador.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <Building2 className="w-4 h-4" />
          <span>Wildcard DNS ativo, mas tenant ausente no banco.</span>
        </div>
      </div>
    </div>
  );
}
