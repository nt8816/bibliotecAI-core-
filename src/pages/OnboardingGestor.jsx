import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, ShieldCheck } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export default function OnboardingGestor() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [invite, setInvite] = useState(null);
  const [invalidInvite, setInvalidInvite] = useState(false);

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');

  const validateInvite = useCallback(async () => {
    if (!token) return;

    try {
      const { data, error } = await supabase
        .rpc('get_tenant_invite_context', { _token: token })
        .maybeSingle();

      if (error || !data) {
        setInvalidInvite(true);
        return;
      }

      setInvite(data);
    } catch (_error) {
      setInvalidInvite(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    validateInvite();
  }, [validateInvite]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (senha.length < 6) {
      toast({ title: 'Senha inválida', description: 'Use ao menos 6 caracteres.', variant: 'destructive' });
      return;
    }

    if (senha !== confirmarSenha) {
      toast({ title: 'Senha inválida', description: 'As senhas não coincidem.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke('registrar-gestor-tenant', {
        body: { token, nome, email, senha },
      });

      if (error) {
        throw new Error(error.message || 'Não foi possível concluir o cadastro');
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Falha no cadastro');
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: senha,
      });

      if (signInError) {
        toast({ title: 'Conta criada', description: 'Faça login para continuar.' });
        navigate('/auth', { replace: true });
        return;
      }

      toast({ title: 'Cadastro concluído', description: 'Bem-vindo ao painel da escola.' });
      navigate('/dashboard', { replace: true });
    } catch (error) {
      toast({
        title: 'Erro no onboarding',
        description: error.message || 'Erro inesperado',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (invalidInvite) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Link inválido</CardTitle>
            <CardDescription>O link de onboarding está expirado ou já foi usado.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/auth')} variant="outline" className="w-full">
              Ir para login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/20">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <ShieldCheck className="w-7 h-7 text-primary" />
          </div>
          <CardTitle>Onboarding do Gestor</CardTitle>
          <CardDescription>
            Escola: <strong>{invite?.escola_nome}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome completo</Label>
              <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="senha">Senha</Label>
              <Input id="senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmarSenha">Confirmar senha</Label>
              <Input
                id="confirmarSenha"
                type="password"
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Criando conta...' : 'Concluir cadastro'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
