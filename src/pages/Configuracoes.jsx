import { Settings, SlidersHorizontal, Shield, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AccessibilityControls } from '@/components/accessibility/AccessibilityControls';
import { useAuth } from '@/hooks/useAuth';

export default function Configuracoes() {
  const navigate = useNavigate();
  const { userRole, user, isGestor, isBibliotecaria } = useAuth();

  const canManageSchool = isGestor || isBibliotecaria;

  return (
    <MainLayout title="Configurações">
      <div className="space-y-4 sm:space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Settings className="size-4 sm:size-5" />
              Preferências Gerais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">Acessibilidade</p>
                <p className="text-xs text-muted-foreground">Ajuste tamanho de fonte, contraste e movimento.</p>
              </div>
              <AccessibilityControls />
            </div>

            <div className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <UserRound className="size-4" />
                Conta atual
              </div>
              <p className="text-sm text-muted-foreground break-all">{user?.email || '-'}</p>
              <div>
                <Badge variant="secondary">{userRole || 'sem papel'}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <SlidersHorizontal className="size-4 sm:size-5" />
              Atalhos de Configuração
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {canManageSchool && (
              <Button className="justify-start gap-2" variant="outline" onClick={() => navigate('/configuracao-escola')}>
                <Shield className="size-4" />
                Configuração da Escola
              </Button>
            )}
            {canManageSchool && (
              <Button className="justify-start gap-2" variant="outline" onClick={() => navigate('/tokens')}>
                <Shield className="size-4" />
                Tokens de Convite
              </Button>
            )}
            <Button className="justify-start gap-2" variant="outline" onClick={() => navigate('/dashboard')}>
              <Settings className="size-4" />
              Voltar ao Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}

