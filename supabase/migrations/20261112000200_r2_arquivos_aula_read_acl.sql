-- Run as the caller: SELECT on the post is still subject to its school/class RLS.
CREATE OR REPLACE FUNCTION public.can_read_r2_arquivo_aula(_object_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.arquivos_aula_posts AS p
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(p.arquivos) = 'array' THEN p.arquivos ELSE '[]'::jsonb END
    ) AS attachment
    WHERE split_part(_object_key, '/', 1) = 'escolas'
      AND split_part(_object_key, '/', 2) = p.escola_id::text
      AND split_part(_object_key, '/', 3) = 'arquivos-aula'
      AND split_part(_object_key, '/', 4) = p.autor_id::text
      AND (attachment->>'object_key' = _object_key OR attachment->>'path' = _object_key)
      AND (
        public.is_super_admin()
        OR (
          p.escola_id = public.get_user_escola_id(auth.uid())
          AND (
            COALESCE(BTRIM(p.turma_publico), '') = ''
            OR public.is_gestor()
            OR public.is_bibliotecaria()
            OR EXISTS (
              SELECT 1 FROM public.usuarios_biblioteca AS student
              WHERE student.user_id = auth.uid() AND student.escola_id = p.escola_id
                AND student.tipo = 'aluno'
                AND BTRIM(student.turma) = BTRIM(p.turma_publico)
            )
            OR EXISTS (
              SELECT 1 FROM public.professor_turmas AS pt
              JOIN public.usuarios_biblioteca AS teacher ON teacher.id = pt.professor_id
              WHERE teacher.user_id = auth.uid() AND teacher.escola_id = p.escola_id
                AND pt.escola_id = p.escola_id AND BTRIM(pt.turma) = BTRIM(p.turma_publico)
            )
          )
        )
      )
  );
$$;
REVOKE ALL ON FUNCTION public.can_read_r2_arquivo_aula(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_r2_arquivo_aula(text) TO authenticated;
