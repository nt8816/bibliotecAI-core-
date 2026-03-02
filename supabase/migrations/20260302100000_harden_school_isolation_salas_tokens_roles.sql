-- Endurece isolamento por escola em salas, convites e roles.

CREATE OR REPLACE FUNCTION public.is_same_user_escola(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _user_id IS NOT NULL
    AND public.get_user_escola_id(_user_id) IS NOT NULL
    AND public.get_user_escola_id(_user_id) = public.get_user_escola_id(auth.uid())
$$;

GRANT EXECUTE ON FUNCTION public.is_same_user_escola(uuid) TO authenticated;

-- =====================
-- salas_cursos (RLS)
-- =====================
DROP POLICY IF EXISTS "Users can view salas_cursos" ON public.salas_cursos;
DROP POLICY IF EXISTS "Gestors can insert salas_cursos" ON public.salas_cursos;
DROP POLICY IF EXISTS "Gestors can update salas_cursos" ON public.salas_cursos;
DROP POLICY IF EXISTS "Gestors can delete salas_cursos" ON public.salas_cursos;

CREATE POLICY "School users can view salas_cursos"
  ON public.salas_cursos
  FOR SELECT
  USING (
    public.is_super_admin()
    OR public.is_same_escola(escola_id)
  );

CREATE POLICY "School staff can insert salas_cursos"
  ON public.salas_cursos
  FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR (
      (public.is_gestor() OR public.is_bibliotecaria())
      AND public.is_same_escola(escola_id)
    )
  );

CREATE POLICY "School staff can update salas_cursos"
  ON public.salas_cursos
  FOR UPDATE
  USING (
    public.is_super_admin()
    OR (
      (public.is_gestor() OR public.is_bibliotecaria())
      AND public.is_same_escola(escola_id)
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      (public.is_gestor() OR public.is_bibliotecaria())
      AND public.is_same_escola(escola_id)
    )
  );

CREATE POLICY "School staff can delete salas_cursos"
  ON public.salas_cursos
  FOR DELETE
  USING (
    public.is_super_admin()
    OR (
      (public.is_gestor() OR public.is_bibliotecaria())
      AND public.is_same_escola(escola_id)
    )
  );

-- =======================
-- tokens_convite (RLS)
-- =======================
DROP POLICY IF EXISTS "Gestors can view all tokens" ON public.tokens_convite;
DROP POLICY IF EXISTS "Gestors can insert tokens" ON public.tokens_convite;
DROP POLICY IF EXISTS "Gestors can update tokens" ON public.tokens_convite;
DROP POLICY IF EXISTS "Gestors can delete tokens" ON public.tokens_convite;
DROP POLICY IF EXISTS "Anyone can view valid token by token value" ON public.tokens_convite;

CREATE POLICY "School staff can view tokens"
  ON public.tokens_convite
  FOR SELECT
  USING (
    public.is_super_admin()
    OR (
      (public.is_gestor() OR public.is_bibliotecaria())
      AND public.is_same_escola(escola_id)
    )
  );

CREATE POLICY "School staff can insert tokens"
  ON public.tokens_convite
  FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR (
      (public.is_gestor() OR public.is_bibliotecaria())
      AND public.is_same_escola(escola_id)
      AND criado_por = auth.uid()
    )
  );

CREATE POLICY "School staff can update tokens"
  ON public.tokens_convite
  FOR UPDATE
  USING (
    public.is_super_admin()
    OR (
      (public.is_gestor() OR public.is_bibliotecaria())
      AND public.is_same_escola(escola_id)
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      (public.is_gestor() OR public.is_bibliotecaria())
      AND public.is_same_escola(escola_id)
    )
  );

CREATE POLICY "School staff can delete tokens"
  ON public.tokens_convite
  FOR DELETE
  USING (
    public.is_super_admin()
    OR (
      (public.is_gestor() OR public.is_bibliotecaria())
      AND public.is_same_escola(escola_id)
    )
  );

CREATE POLICY "Anyone can view valid token by token value"
  ON public.tokens_convite
  FOR SELECT
  USING (ativo = true AND expira_em > now() AND usado_por IS NULL);

-- ==================
-- user_roles (RLS)
-- ==================
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Only gestors can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Only gestors can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Only gestors can delete roles" ON public.user_roles;

CREATE POLICY "Users can view own roles and school roles"
  ON public.user_roles
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.is_super_admin()
    OR (
      (public.is_gestor() OR public.is_bibliotecaria())
      AND public.is_same_user_escola(user_id)
    )
  );

CREATE POLICY "Gestors can insert roles in own school"
  ON public.user_roles
  FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR (public.is_gestor() AND public.is_same_user_escola(user_id))
  );

CREATE POLICY "Gestors can update roles in own school"
  ON public.user_roles
  FOR UPDATE
  USING (
    public.is_super_admin()
    OR (public.is_gestor() AND public.is_same_user_escola(user_id))
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.is_gestor() AND public.is_same_user_escola(user_id))
  );

CREATE POLICY "Gestors can delete roles in own school"
  ON public.user_roles
  FOR DELETE
  USING (
    public.is_super_admin()
    OR (public.is_gestor() AND public.is_same_user_escola(user_id))
  );
