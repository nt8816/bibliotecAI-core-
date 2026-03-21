ALTER TABLE public.reclamacoes_super_admin
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] NOT NULL DEFAULT '{}';
