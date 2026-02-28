-- Remove perfis duplicados por user_id e garante unicidade para evitar erro de .single().
WITH ranked AS (
  SELECT
    id,
    user_id,
    row_number() OVER (
      PARTITION BY user_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC, id DESC
    ) AS rn
  FROM public.usuarios_biblioteca
  WHERE user_id IS NOT NULL
)
DELETE FROM public.usuarios_biblioteca u
USING ranked r
WHERE u.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_biblioteca_user_id_unique
  ON public.usuarios_biblioteca (user_id)
  WHERE user_id IS NOT NULL;

