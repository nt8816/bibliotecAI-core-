ALTER TABLE public.arquivos_aula_posts
  ADD COLUMN IF NOT EXISTS autor_nome text;

UPDATE public.arquivos_aula_posts ap
SET autor_nome = ub.nome
FROM public.usuarios_biblioteca ub
WHERE ub.id = ap.autor_id
  AND COALESCE(BTRIM(ap.autor_nome), '') = '';
