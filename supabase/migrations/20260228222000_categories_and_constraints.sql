BEGIN;

-- Pre-categorias de livros por escola.
CREATE TABLE IF NOT EXISTS public.categorias_livros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id uuid NOT NULL REFERENCES public.escolas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT categorias_livros_nome_not_blank_chk CHECK (btrim(nome) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS categorias_livros_escola_nome_key
  ON public.categorias_livros (escola_id, nome);

ALTER TABLE public.categorias_livros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Categorias visiveis por escola" ON public.categorias_livros;
CREATE POLICY "Categorias visiveis por escola"
ON public.categorias_livros
FOR SELECT
TO authenticated
USING (
  escola_id = public.get_user_escola_id(auth.uid())
);

DROP POLICY IF EXISTS "Categorias gerenciadas por gestor ou bibliotecaria" ON public.categorias_livros;
CREATE POLICY "Categorias gerenciadas por gestor ou bibliotecaria"
ON public.categorias_livros
FOR ALL
TO authenticated
USING (
  escola_id = public.get_user_escola_id(auth.uid())
  AND (public.is_gestor() OR public.is_bibliotecaria())
)
WITH CHECK (
  escola_id = public.get_user_escola_id(auth.uid())
  AND (public.is_gestor() OR public.is_bibliotecaria())
);

REVOKE ALL ON TABLE public.categorias_livros FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.categorias_livros TO authenticated;

-- Usuarios: matricula unica por escola (normalizada), com validacao de formato.
ALTER TABLE public.usuarios_biblioteca
  DROP CONSTRAINT IF EXISTS usuarios_biblioteca_matricula_key;

ALTER TABLE public.usuarios_biblioteca
  DROP CONSTRAINT IF EXISTS usuarios_biblioteca_matricula_format_chk;

ALTER TABLE public.usuarios_biblioteca
  ADD CONSTRAINT usuarios_biblioteca_matricula_format_chk
  CHECK (
    matricula IS NULL
    OR btrim(matricula) = ''
    OR btrim(matricula) ~ '^[A-Za-z0-9._-]{6,32}$'
  ) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_biblioteca_escola_matricula_norm_key
  ON public.usuarios_biblioteca (
    escola_id,
    regexp_replace(lower(coalesce(matricula, '')), '[^a-z0-9]', '', 'g')
  )
  WHERE matricula IS NOT NULL AND btrim(matricula) <> '' AND escola_id IS NOT NULL;

-- Livros: tombo unico normalizado para evitar duplicidade com variacao de formatacao.
ALTER TABLE public.livros
  DROP CONSTRAINT IF EXISTS livros_tombo_key;

CREATE UNIQUE INDEX IF NOT EXISTS livros_tombo_norm_key
  ON public.livros (
    regexp_replace(lower(coalesce(tombo, '')), '[^a-z0-9]', '', 'g')
  )
  WHERE tombo IS NOT NULL AND btrim(tombo) <> '';

COMMIT;
