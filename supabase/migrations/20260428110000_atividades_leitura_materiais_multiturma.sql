ALTER TABLE public.atividades_leitura
  ADD COLUMN IF NOT EXISTS materiais_apoio JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS turmas_alvo TEXT[] NULL;

UPDATE public.atividades_leitura
SET materiais_apoio = '[]'::jsonb
WHERE materiais_apoio IS NULL;
