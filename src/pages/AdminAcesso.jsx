import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ShieldCheck } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export default function AdminAcesso() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: 'nt@gmail.com',
    senha: '123456',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await signIn(formData.email.trim().toLowerCase(), formData.senha);
      if (error) {
        throw error;
      }
      navigate('/admin/tenants', { replace: true });
    } catch (error) {
      toast({
        title: 'Falha no acesso admin',
        description: error?.message || 'Não foi possível entrar com as credenciais informadas.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <ShieldCheck className="w-7 h-7 text-primary" />
          </div>
          <CardTitle>Acesso Admin</CardTitle>
          <CardDescription>Área de administração das escolas e criação de acesso da gestão.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Login</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="senha">Senha</Label>
              <Input
                id="senha"
                type="password"
                value={formData.senha}
                onChange={(e) => setFormData((prev) => ({ ...prev, senha: e.target.value }))}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="mr-2 w-4 h-4 animate-spin" /> : null}
              Entrar no Admin
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

