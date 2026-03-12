-- Permitir posts do tipo quiz na comunidade
ALTER TABLE public.comunidade_posts
  DROP CONSTRAINT IF EXISTS comunidade_posts_tipo_check;

ALTER TABLE public.comunidade_posts
  ADD CONSTRAINT comunidade_posts_tipo_check
  CHECK (tipo IN ('resenha', 'sugestao', 'dica', 'quiz'));
