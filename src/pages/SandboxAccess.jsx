import { Link } from 'react-router-dom';
import { ExternalLink, FlaskConical, Lock, Sparkles, Wifi } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  canPerformRealWrites,
  getAppEnvironmentLabel,
  getPlatformApiBaseUrl,
  getSandboxPublicUrl,
  getSupabaseUrl,
  isPointingToLikelyProductionServices,
  isProtectedNonProductionEnvironment,
  isProductionEnvironment,
} from '@/lib/appEnvironment';

function maskUrl(url) {
  if (!url) return 'Nao configurado';

  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  } catch {
    return url;
  }
}

export default function SandboxAccess() {
  const environmentLabel = getAppEnvironmentLabel();
  const writeEnabled = canPerformRealWrites();
  const protectedMode = isProtectedNonProductionEnvironment();
  const isProduction = isProductionEnvironment();
  const productionHint = isPointingToLikelyProductionServices();
  const publicUrl = getSandboxPublicUrl();

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.15),transparent_34%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--muted)/0.75))] px-4 py-8 sm:px-6 sm:py-12">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(14,165,233,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(14,165,233,0.05)_1px,transparent_1px)] bg-[size:34px_34px]" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/60 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-sky-900">
            <FlaskConical className="h-3.5 w-3.5" />
            Sandbox Online
          </div>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-foreground sm:text-5xl">
            Area publica para testes de homologacao
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            Use esta entrada para validar fluxos com IA, automacoes, navegadores remotos e testes manuais sem depender do ambiente de producao.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="border-sky-200/70 bg-white/90">
            <CardHeader>
              <CardTitle>Status do ambiente</CardTitle>
              <CardDescription>
                Este painel existe para deixar claro onde o teste esta acontecendo e qual o nivel de risco operacional.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Ambiente</p>
                <p className="mt-2 text-2xl font-bold text-foreground">{environmentLabel}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Escrita</p>
                <p className="mt-2 text-2xl font-bold text-foreground">{writeEnabled ? 'Liberada' : 'Bloqueada'}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Platform API</p>
                <p className="mt-2 break-all text-sm font-medium text-foreground">{maskUrl(getPlatformApiBaseUrl())}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Supabase</p>
                <p className="mt-2 break-all text-sm font-medium text-foreground">{maskUrl(getSupabaseUrl())}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-sky-200/70 bg-white/90">
            <CardHeader>
              <CardTitle>Entradas rapidas</CardTitle>
              <CardDescription>
                Links publicos para abrir o ambiente e entrar no fluxo de login.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild className="w-full justify-between">
                <Link to="/auth">
                  Abrir login da homologacao
                  <Lock className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-between">
                <Link to="/dashboard">
                  Testar redirecionamento autenticado
                  <Sparkles className="h-4 w-4" />
                </Link>
              </Button>
              {publicUrl && (
                <Button asChild variant="outline" className="w-full justify-between">
                  <a href={publicUrl} target="_blank" rel="noreferrer">
                    Abrir URL publica configurada
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="bg-white/85">
            <CardHeader>
              <CardTitle className="text-xl">Como usar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm leading-6 text-muted-foreground">
              <p>Publique esta build em um dominio separado, como `sandbox.bibliotecai.com.br`.</p>
              <p>Deixe `VITE_APP_ENV=homolog` e `VITE_APP_WRITE_GUARD=readonly` por padrao.</p>
              <p>Use credenciais e banco proprios de homologacao.</p>
            </CardContent>
          </Card>

          <Card className="bg-white/85">
            <CardHeader>
              <CardTitle className="text-xl">Sinal de risco</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm leading-6 text-muted-foreground">
              <p>{protectedMode ? 'Modo protegido ativo: mutacoes ficam barradas no cliente.' : 'Modo protegido inativo neste deploy.'}</p>
              <p>{productionHint ? 'Os endpoints parecem de producao. Mantenha o guard ativo ate separar as credenciais.' : 'Os endpoints nao aparentam ser de producao.'}</p>
              <p>{isProduction ? 'Este deploy esta marcado como producao. Nao use esta pagina como sandbox real.' : 'Este deploy nao esta marcado como producao.'}</p>
            </CardContent>
          </Card>

          <Card className="bg-white/85">
            <CardHeader>
              <CardTitle className="text-xl">Testes com IA</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm leading-6 text-muted-foreground">
              <p>Use esta rota para browser agents validarem carregamento, login e navegacao.</p>
              <p>Para testes de escrita automatizada, habilite `VITE_ALLOW_REAL_WRITES=true` apenas no sandbox certo.</p>
              <p className="flex items-center gap-2 font-medium text-foreground">
                <Wifi className="h-4 w-4 text-sky-700" />
                Rota sugerida: `/sandbox`
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
