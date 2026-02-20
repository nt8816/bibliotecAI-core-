import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Library, Loader2, Eye, EyeOff } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

const loginSchema = z.object({
  login: z.string().trim().min(2, 'Informe seu email ou matrícula'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
});

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    login: '',
    password: '',
  });
  const [errors, setErrors] = useState({});

  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const loginWithIdentifier = async (login, password) => {
    const normalized = login.trim();

    if (normalized.includes('@')) {
      return signIn(normalized.toLowerCase(), password);
    }

    const matricula = normalized.replace(/\s+/g, '');
    const candidates = [`${matricula}@temp.bibliotecai.com`];

    // Best effort: if RLS permits this lookup, prefer the real email mapped to the matricula.
    const { data: profile } = await supabase
      .from('usuarios_biblioteca')
      .select('email, user_id')
      .eq('matricula', matricula)
      .maybeSingle();

    if (profile && !profile.user_id) {
      return {
        error: {
          message:
            'Matrícula encontrada, mas o acesso ainda não foi ativado. Use o link de convite do gestor para criar a conta.',
        },
      };
    }

    if (profile?.email) {
      candidates.unshift(profile.email);
    }

    let lastError = null;

    for (const candidate of [...new Set(candidates)]) {
      const result = await signIn(candidate, password);

      if (!result.error) {
        return result;
      }

      lastError = result.error;

      // Stop fallback chain for non-auth errors.
      if (result.error.message !== 'Invalid login credentials') {
        break;
      }
    }

    return { error: lastError };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    setLoading(true);

    try {
      const result = loginSchema.safeParse(formData);

      if (!result.success) {
        const fieldErrors = {};

        result.error.errors.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0]] = err.message;
          }
        });

        setErrors(fieldErrors);
        setLoading(false);
        return;
      }

      const { error } = await loginWithIdentifier(formData.login, formData.password);

      if (error) {
        toast({
          variant: 'destructive',
          title: 'Erro ao entrar',
          description:
            error.message === 'Invalid login credentials'
              ? 'Email/matrícula ou senha incorretos'
              : error.message,
        });

        return;
      }

      toast({
        title: 'Bem-vindo!',
        description: 'Login realizado com sucesso.',
      });
    } catch (_error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Ocorreu um erro inesperado. Tente novamente.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-login-page min-h-screen flex items-center justify-center p-3 sm:p-4 overflow-hidden">
      <div className="auth-bg-grid" aria-hidden="true" />
      <div className="auth-orb auth-orb-1" aria-hidden="true" />
      <div className="auth-orb auth-orb-2" aria-hidden="true" />
      <div className="auth-orb auth-orb-3" aria-hidden="true" />

      <Card className="auth-login-card w-full max-w-[560px] sm:max-w-md bg-white border-primary/20 shadow-xl" translate="no">
        <CardHeader className="text-center space-y-3 px-4 pt-5 pb-3 sm:px-6 sm:pt-6 sm:pb-3">
          <div className="auth-logo-wrap mx-auto w-16 h-16 rounded-full bg-primary flex items-center justify-center">
            <Library className="w-8 h-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold">BibliotecAI</CardTitle>
          <CardDescription>Entre com email ou matrícula. Para aluno, use a matrícula também na senha inicial.</CardDescription>
        </CardHeader>

        <CardContent className="px-4 pb-5 sm:px-6 sm:pb-6 pt-0">
          <form onSubmit={handleSubmit} className="space-y-4 auth-login-form w-full">
            <div className="space-y-2 auth-field auth-field-1">
              <Label htmlFor="login">Email ou matrícula</Label>
              <Input
                id="login"
                type="text"
                autoComplete="username"
                placeholder="seu@email.com ou 202400123"
                value={formData.login}
                onChange={(e) => setFormData({ ...formData, login: e.target.value })}
                disabled={loading}
                className="auth-input transition-all duration-300 focus-visible:ring-2 focus-visible:ring-primary/60"
              />
              {errors.login && <p className="text-sm text-destructive">{errors.login}</p>}
            </div>

            <div className="space-y-2 auth-field auth-field-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative auth-password-wrap">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  disabled={loading}
                  className="auth-input pr-11 transition-all duration-300 focus-visible:ring-2 focus-visible:ring-primary/60"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="auth-password-toggle absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
            </div>

            <Button type="submit" className="w-full auth-login-button auth-field auth-field-3" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
