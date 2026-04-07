import { Link } from 'react-router-dom';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function Privacidade() {
  return (
    <div className="min-h-screen bg-background px-3 py-6 sm:px-4 sm:py-8">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <Card>
          <CardHeader className="space-y-3">
            <CardTitle className="text-2xl sm:text-3xl">Política de Privacidade e Termos de Uso</CardTitle>
            <CardDescription>
              Ao acessar o BibliotecAi, o usuário concorda com estas condições de uso e privacidade.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 text-sm leading-6 text-muted-foreground">
            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">1. Finalidade do aplicativo</h2>
              <p>
                O BibliotecAi é uma plataforma voltada à gestão de biblioteca escolar, atividades de leitura,
                empréstimos, comunicados, comunidade escolar e recursos educacionais para alunos, professores,
                bibliotecárias, gestores e administradores.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">2. Dados utilizados</h2>
              <p>
                O aplicativo pode utilizar dados de cadastro e uso, como nome, matrícula ou CPF, perfil de acesso,
                escola vinculada, informações de leitura, empréstimos, atividades, notificações e conteúdos publicados
                dentro da plataforma.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">3. Microfone e envio de áudio</h2>
              <p>
                Quando disponível para o perfil do usuário, o aplicativo pode solicitar acesso ao microfone para gravar
                áudios em comunicados e publicações. O uso desse recurso ocorre apenas mediante ação do usuário.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">4. Notificações</h2>
              <p>
                O BibliotecAi pode enviar notificações relacionadas a atividades, empréstimos, comunicados, mensagens e
                avisos importantes da rotina escolar.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">5. Compartilhamento interno</h2>
              <p>
                Informações e conteúdos publicados no app podem ser exibidos para usuários autorizados dentro do mesmo
                ambiente escolar, conforme o perfil de acesso e as permissões definidas pela instituição.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">6. Responsabilidade da instituição</h2>
              <p>
                A escola ou organização responsável pelo uso da plataforma define perfis, acessos e regras internas de
                utilização. O usuário deve utilizar o aplicativo de forma adequada, respeitando as políticas da
                instituição.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">7. Aceite</h2>
              <p>
                Ao fazer login, o usuário declara estar ciente desta Política de Privacidade e dos Termos de Uso do
                BibliotecAi.
              </p>
            </section>

            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link to="/auth">Voltar para o login</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
