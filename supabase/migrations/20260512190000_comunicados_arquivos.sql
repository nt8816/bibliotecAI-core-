BEGIN;

ALTER TABLE public.comunidade_posts
  ADD COLUMN IF NOT EXISTS arquivos jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS comunidade_posts_arquivos_gin_idx
  ON public.comunidade_posts
  USING gin (arquivos)
  WHERE arquivos <> '[]'::jsonb;

COMMIT;
