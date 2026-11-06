-- Storage access follows the RLS-visible post referencing the exact object.
-- Owners retain access to uploads before a post has been created.
DROP POLICY IF EXISTS "Authenticated users can read arquivos aula objects" ON storage.objects;
CREATE POLICY "Users can read authorized arquivos aula objects" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'arquivos-aula' AND (
      owner = auth.uid() OR EXISTS (
        SELECT 1 FROM public.arquivos_aula_posts p
        JOIN public.usuarios_biblioteca author ON author.id = p.autor_id
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(p.arquivos) = 'array' THEN p.arquivos ELSE '[]'::jsonb END
        ) AS attachment
        WHERE author.user_id = storage.objects.owner
          AND (attachment->>'path' = storage.objects.name
            OR attachment->>'object_key' = storage.objects.name)
      )
    )
  );
