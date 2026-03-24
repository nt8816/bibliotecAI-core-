BEGIN;

CREATE TABLE IF NOT EXISTS public.solicitacoes_emprestimo_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL REFERENCES public.solicitacoes_emprestimo(id) ON DELETE CASCADE,
  autor_usuario_id uuid REFERENCES public.usuarios_biblioteca(id) ON DELETE SET NULL,
  autor_tipo text NOT NULL,
  mensagem text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.solicitacoes_emprestimo_mensagens
  DROP CONSTRAINT IF EXISTS solicitacoes_emprestimo_mensagens_autor_tipo_check;

ALTER TABLE public.solicitacoes_emprestimo_mensagens
  ADD CONSTRAINT solicitacoes_emprestimo_mensagens_autor_tipo_check
  CHECK (autor_tipo IN ('aluno', 'bibliotecaria', 'gestor'));

ALTER TABLE public.solicitacoes_emprestimo_mensagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own loan request messages" ON public.solicitacoes_emprestimo_mensagens;
CREATE POLICY "Users can view their own loan request messages"
  ON public.solicitacoes_emprestimo_mensagens
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.solicitacoes_emprestimo se
      JOIN public.usuarios_biblioteca ub ON ub.id = se.usuario_id
      WHERE se.id = solicitacoes_emprestimo_mensagens.solicitacao_id
        AND ub.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert their own loan request messages" ON public.solicitacoes_emprestimo_mensagens;
CREATE POLICY "Users can insert their own loan request messages"
  ON public.solicitacoes_emprestimo_mensagens
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.solicitacoes_emprestimo se
      JOIN public.usuarios_biblioteca ub ON ub.id = se.usuario_id
      WHERE se.id = solicitacoes_emprestimo_mensagens.solicitacao_id
        AND ub.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Staff can view all loan request messages" ON public.solicitacoes_emprestimo_mensagens;
CREATE POLICY "Staff can view all loan request messages"
  ON public.solicitacoes_emprestimo_mensagens
  FOR SELECT
  USING (is_bibliotecaria() OR is_gestor());

DROP POLICY IF EXISTS "Staff can insert loan request messages" ON public.solicitacoes_emprestimo_mensagens;
CREATE POLICY "Staff can insert loan request messages"
  ON public.solicitacoes_emprestimo_mensagens
  FOR INSERT
  WITH CHECK (is_bibliotecaria() OR is_gestor());

COMMIT;
