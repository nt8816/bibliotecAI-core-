BEGIN;

CREATE INDEX IF NOT EXISTS categorias_livros_created_by_idx
  ON public.categorias_livros (created_by);

COMMIT;

