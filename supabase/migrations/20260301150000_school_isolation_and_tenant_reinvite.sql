-- Isolamento real por escola + geração de novos links de onboarding por tenant.

CREATE OR REPLACE FUNCTION public.is_same_escola(_escola_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _escola_id IS NOT NULL
    AND _escola_id = public.get_user_escola_id(auth.uid())
$$;

GRANT EXECUTE ON FUNCTION public.is_same_escola(uuid) TO authenticated;

ALTER TABLE public.livros
  ADD COLUMN IF NOT EXISTS escola_id uuid REFERENCES public.escolas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS livros_escola_id_idx ON public.livros (escola_id);

-- Backfill de livros antigos, quando possível, a partir do histórico de empréstimos.
WITH ranked_school AS (
  SELECT
    e.livro_id,
    ub.escola_id,
    count(*) AS total,
    row_number() OVER (
      PARTITION BY e.livro_id
      ORDER BY count(*) DESC, ub.escola_id
    ) AS rn
  FROM public.emprestimos e
  JOIN public.usuarios_biblioteca ub ON ub.id = e.usuario_id
  WHERE ub.escola_id IS NOT NULL
  GROUP BY e.livro_id, ub.escola_id
)
UPDATE public.livros l
SET escola_id = rs.escola_id
FROM ranked_school rs
WHERE l.id = rs.livro_id
  AND l.escola_id IS NULL
  AND rs.rn = 1;

-- Tombo único por escola (não global).
DROP INDEX IF EXISTS public.livros_tombo_norm_key;
CREATE UNIQUE INDEX IF NOT EXISTS livros_escola_tombo_norm_key
  ON public.livros (
    escola_id,
    lower(regexp_replace(coalesce(tombo, ''), '[^a-z0-9]', '', 'g'))
  )
  WHERE tombo IS NOT NULL
    AND btrim(tombo) <> ''
    AND escola_id IS NOT NULL;

-- =========================
-- usuarios_biblioteca (RLS)
-- =========================
DROP POLICY IF EXISTS "Gestors can view all users" ON public.usuarios_biblioteca;
DROP POLICY IF EXISTS "Bibliotecaria can view all users" ON public.usuarios_biblioteca;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.usuarios_biblioteca;
DROP POLICY IF EXISTS "Bibliotecaria can insert users" ON public.usuarios_biblioteca;
DROP POLICY IF EXISTS "Gestors can insert users" ON public.usuarios_biblioteca;
DROP POLICY IF EXISTS "Gestors can update all users" ON public.usuarios_biblioteca;
DROP POLICY IF EXISTS "Gestors can delete users" ON public.usuarios_biblioteca;
DROP POLICY IF EXISTS "Professors can view students of their school" ON public.usuarios_biblioteca;

CREATE POLICY "Users can view own profile"
  ON public.usuarios_biblioteca
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "School staff can view users in school"
  ON public.usuarios_biblioteca
  FOR SELECT
  USING (
    public.is_super_admin()
    OR (
      (public.is_gestor() OR public.is_bibliotecaria())
      AND public.is_same_escola(escola_id)
    )
  );

CREATE POLICY "Professors can view students in school"
  ON public.usuarios_biblioteca
  FOR SELECT
  USING (
    public.is_professor()
    AND tipo = 'aluno'::public.app_role
    AND public.is_same_escola(escola_id)
  );

CREATE POLICY "School staff can insert users in school"
  ON public.usuarios_biblioteca
  FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR (
      (public.is_gestor() OR public.is_bibliotecaria())
      AND public.is_same_escola(escola_id)
    )
  );

CREATE POLICY "School staff can update users in school"
  ON public.usuarios_biblioteca
  FOR UPDATE
  USING (
    public.is_super_admin()
    OR (
      (public.is_gestor() OR public.is_bibliotecaria())
      AND public.is_same_escola(escola_id)
    )
    OR auth.uid() = user_id
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      (public.is_gestor() OR public.is_bibliotecaria())
      AND public.is_same_escola(escola_id)
    )
    OR auth.uid() = user_id
  );

CREATE POLICY "School staff can delete users in school"
  ON public.usuarios_biblioteca
  FOR DELETE
  USING (
    public.is_super_admin()
    OR (
      (public.is_gestor() OR public.is_bibliotecaria())
      AND public.is_same_escola(escola_id)
    )
  );

-- =================
-- livros (RLS)
-- =================
DROP POLICY IF EXISTS "Everyone can view books" ON public.livros;
DROP POLICY IF EXISTS "Bibliotecaria can insert books" ON public.livros;
DROP POLICY IF EXISTS "Bibliotecaria can update books" ON public.livros;
DROP POLICY IF EXISTS "Bibliotecaria can delete books" ON public.livros;
DROP POLICY IF EXISTS "Gestors can insert books" ON public.livros;
DROP POLICY IF EXISTS "Gestors can update books" ON public.livros;
DROP POLICY IF EXISTS "Gestors can delete books" ON public.livros;

CREATE POLICY "Users can view books from own school"
  ON public.livros
  FOR SELECT
  USING (public.is_super_admin() OR public.is_same_escola(escola_id));

CREATE POLICY "School staff can insert books"
  ON public.livros
  FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR ((public.is_gestor() OR public.is_bibliotecaria()) AND public.is_same_escola(escola_id))
  );

CREATE POLICY "School staff can update books"
  ON public.livros
  FOR UPDATE
  USING (
    public.is_super_admin()
    OR ((public.is_gestor() OR public.is_bibliotecaria()) AND public.is_same_escola(escola_id))
  )
  WITH CHECK (
    public.is_super_admin()
    OR ((public.is_gestor() OR public.is_bibliotecaria()) AND public.is_same_escola(escola_id))
  );

CREATE POLICY "School staff can delete books"
  ON public.livros
  FOR DELETE
  USING (
    public.is_super_admin()
    OR ((public.is_gestor() OR public.is_bibliotecaria()) AND public.is_same_escola(escola_id))
  );

-- =====================
-- emprestimos (RLS)
-- =====================
DROP POLICY IF EXISTS "Bibliotecaria can manage loans" ON public.emprestimos;
DROP POLICY IF EXISTS "Gestors can view all loans" ON public.emprestimos;
DROP POLICY IF EXISTS "Gestors can insert loans" ON public.emprestimos;
DROP POLICY IF EXISTS "Gestors can update loans" ON public.emprestimos;
DROP POLICY IF EXISTS "Gestors can delete loans" ON public.emprestimos;
DROP POLICY IF EXISTS "Users can view their own loans" ON public.emprestimos;

CREATE POLICY "Users can view own loans"
  ON public.emprestimos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios_biblioteca ub
      WHERE ub.id = emprestimos.usuario_id
        AND ub.user_id = auth.uid()
    )
  );

CREATE POLICY "School staff can view loans"
  ON public.emprestimos
  FOR SELECT
  USING (
    public.is_super_admin()
    OR (
      (public.is_gestor() OR public.is_bibliotecaria())
      AND EXISTS (
        SELECT 1
        FROM public.usuarios_biblioteca ub
        WHERE ub.id = emprestimos.usuario_id
          AND public.is_same_escola(ub.escola_id)
      )
    )
  );

CREATE POLICY "School staff can insert loans"
  ON public.emprestimos
  FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR (
      (public.is_gestor() OR public.is_bibliotecaria())
      AND EXISTS (
        SELECT 1
        FROM public.usuarios_biblioteca ub
        JOIN public.livros l ON l.id = emprestimos.livro_id
        WHERE ub.id = emprestimos.usuario_id
          AND ub.escola_id = l.escola_id
          AND public.is_same_escola(ub.escola_id)
      )
    )
  );

CREATE POLICY "School staff can update loans"
  ON public.emprestimos
  FOR UPDATE
  USING (
    public.is_super_admin()
    OR (
      (public.is_gestor() OR public.is_bibliotecaria())
      AND EXISTS (
        SELECT 1
        FROM public.usuarios_biblioteca ub
        WHERE ub.id = emprestimos.usuario_id
          AND public.is_same_escola(ub.escola_id)
      )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      (public.is_gestor() OR public.is_bibliotecaria())
      AND EXISTS (
        SELECT 1
        FROM public.usuarios_biblioteca ub
        JOIN public.livros l ON l.id = emprestimos.livro_id
        WHERE ub.id = emprestimos.usuario_id
          AND ub.escola_id = l.escola_id
          AND public.is_same_escola(ub.escola_id)
      )
    )
  );

CREATE POLICY "School staff can delete loans"
  ON public.emprestimos
  FOR DELETE
  USING (
    public.is_super_admin()
    OR (
      (public.is_gestor() OR public.is_bibliotecaria())
      AND EXISTS (
        SELECT 1
        FROM public.usuarios_biblioteca ub
        WHERE ub.id = emprestimos.usuario_id
          AND public.is_same_escola(ub.escola_id)
      )
    )
  );

-- ======================================
-- Novo convite de gestor para tenant
-- ======================================
CREATE OR REPLACE FUNCTION public.create_tenant_admin_invite(
  _tenant_id uuid,
  _invite_cpf text DEFAULT NULL,
  _base_domain text DEFAULT NULL,
  _invite_expires_hours integer DEFAULT 72
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant public.tenants%ROWTYPE;
  v_escola_id uuid;
  v_invite_token text;
  v_onboarding_url text;
  v_invite_cpf text;
BEGIN
  IF NOT public.is_tenant_platform_admin() THEN
    RAISE EXCEPTION 'Somente admin de plataforma pode gerar convites de tenant';
  END IF;

  SELECT * INTO v_tenant
  FROM public.tenants
  WHERE id = _tenant_id
    AND ativo = true
  LIMIT 1;

  IF v_tenant.id IS NULL THEN
    RAISE EXCEPTION 'Tenant não encontrado ou inativo';
  END IF;

  v_escola_id := v_tenant.escola_id;
  IF v_escola_id IS NULL THEN
    RAISE EXCEPTION 'Tenant sem escola vinculada';
  END IF;

  v_invite_cpf := nullif(regexp_replace(coalesce(_invite_cpf, ''), '[^0-9]', '', 'g'), '');
  IF v_invite_cpf IS NOT NULL AND length(v_invite_cpf) <> 11 THEN
    RAISE EXCEPTION 'CPF do convite deve ter 11 dígitos';
  END IF;

  INSERT INTO public.tenant_admin_invites (tenant_id, escola_id, cpf, expira_em, created_by)
  VALUES (
    v_tenant.id,
    v_escola_id,
    v_invite_cpf,
    now() + (greatest(coalesce(_invite_expires_hours, 72), 1)::text || ' hours')::interval,
    auth.uid()
  )
  RETURNING token INTO v_invite_token;

  IF _base_domain IS NOT NULL AND trim(_base_domain) <> '' THEN
    v_onboarding_url := format('https://%s.%s/onboarding/%s', v_tenant.subdominio, trim(_base_domain), v_invite_token);
  ELSE
    v_onboarding_url := format('/onboarding/%s?tenant=%s', v_invite_token, v_tenant.subdominio);
  END IF;

  RETURN jsonb_build_object(
    'tenant_id', v_tenant.id,
    'escola_id', v_escola_id,
    'escola_nome', v_tenant.nome,
    'subdominio', v_tenant.subdominio,
    'invite_token', v_invite_token,
    'onboarding_url', v_onboarding_url
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_tenant_admin_invite(uuid, text, text, integer) TO authenticated;
