-- Permite moderação de posts da comunidade pela gestão escolar

DROP POLICY IF EXISTS "Gestao can delete community posts" ON public.comunidade_posts;

CREATE POLICY "Gestao can delete community posts"
  ON public.comunidade_posts
  FOR DELETE
  USING (is_gestor() OR is_bibliotecaria());
