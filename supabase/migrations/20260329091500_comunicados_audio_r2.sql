BEGIN;

ALTER TABLE public.comunidade_posts
  ADD COLUMN IF NOT EXISTS audio_url text,
  ADD COLUMN IF NOT EXISTS audio_duration_seconds integer;

CREATE INDEX IF NOT EXISTS comunidade_posts_audio_url_idx
  ON public.comunidade_posts (audio_url)
  WHERE audio_url IS NOT NULL;

COMMIT;
