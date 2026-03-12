CREATE TABLE IF NOT EXISTS public.notificacoes_lidas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES public.usuarios_biblioteca(id) ON DELETE CASCADE,
  notification_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notificacoes_lidas_unique UNIQUE (usuario_id, notification_id)
);

CREATE INDEX IF NOT EXISTS notificacoes_lidas_usuario_idx ON public.notificacoes_lidas(usuario_id);

ALTER TABLE public.notificacoes_lidas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own read notifications" ON public.notificacoes_lidas;
DROP POLICY IF EXISTS "Users can insert own read notifications" ON public.notificacoes_lidas;
DROP POLICY IF EXISTS "Users can delete own read notifications" ON public.notificacoes_lidas;

CREATE POLICY "Users can view own read notifications"
  ON public.notificacoes_lidas
  FOR SELECT
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.usuarios_biblioteca ub
      WHERE ub.id = notificacoes_lidas.usuario_id
        AND ub.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own read notifications"
  ON public.notificacoes_lidas
  FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.usuarios_biblioteca ub
      WHERE ub.id = notificacoes_lidas.usuario_id
        AND ub.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own read notifications"
  ON public.notificacoes_lidas
  FOR DELETE
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.usuarios_biblioteca ub
      WHERE ub.id = notificacoes_lidas.usuario_id
        AND ub.user_id = auth.uid()
    )
  );
