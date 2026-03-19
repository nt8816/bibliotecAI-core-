DROP POLICY IF EXISTS "School users can delete community posts" ON public.comunidade_posts;

CREATE POLICY "Users can delete own community posts"
  ON public.comunidade_posts
  FOR DELETE
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.usuarios_biblioteca ub
      WHERE ub.id = comunidade_posts.autor_id
        AND ub.user_id = auth.uid()
        AND (
          comunidade_posts.escola_id IS NULL
          OR ub.escola_id = comunidade_posts.escola_id
        )
    )
  );
