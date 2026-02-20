-- Comunidade: permitir anexar imagens e audiobook nos posts

ALTER TABLE public.comunidade_posts
  ADD COLUMN IF NOT EXISTS imagem_urls text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS audiobook_id uuid REFERENCES public.audiobooks_biblioteca(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_comunidade_posts_audiobook_id ON public.comunidade_posts(audiobook_id);
