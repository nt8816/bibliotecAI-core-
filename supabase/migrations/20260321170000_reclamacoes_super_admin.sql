CREATE TABLE IF NOT EXISTS public.reclamacoes_super_admin (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_profile_id UUID REFERENCES public.usuarios_biblioteca(id) ON DELETE SET NULL,
  escola_id UUID REFERENCES public.escolas(id) ON DELETE SET NULL,
  sender_nome TEXT,
  sender_email TEXT,
  sender_role TEXT NOT NULL,
  assunto TEXT NOT NULL CHECK (char_length(trim(assunto)) BETWEEN 3 AND 160),
  mensagem TEXT NOT NULL CHECK (char_length(trim(mensagem)) BETWEEN 10 AND 4000),
  status TEXT NOT NULL DEFAULT 'nova' CHECK (status IN ('nova', 'em_analise', 'respondida', 'arquivada')),
  resposta TEXT,
  lida_em TIMESTAMPTZ,
  respondida_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reclamacoes_super_admin_created_at_idx
  ON public.reclamacoes_super_admin (created_at DESC);

CREATE INDEX IF NOT EXISTS reclamacoes_super_admin_status_idx
  ON public.reclamacoes_super_admin (status, created_at DESC);

CREATE INDEX IF NOT EXISTS reclamacoes_super_admin_sender_user_idx
  ON public.reclamacoes_super_admin (sender_user_id, created_at DESC);

ALTER TABLE public.reclamacoes_super_admin ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.sync_reclamacao_super_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_nome TEXT;
  v_email TEXT;
  v_profile_id UUID;
  v_escola_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.sender_user_id := auth.uid();

    SELECT ur.role::text
      INTO v_role
      FROM public.user_roles ur
     WHERE ur.user_id = auth.uid()
       AND ur.role::text IN ('gestor', 'bibliotecaria', 'professor', 'aluno')
     ORDER BY CASE ur.role::text
       WHEN 'gestor' THEN 1
       WHEN 'bibliotecaria' THEN 2
       WHEN 'professor' THEN 3
       WHEN 'aluno' THEN 4
       ELSE 99
     END
     LIMIT 1;

    SELECT ub.id, ub.escola_id, ub.nome, ub.email
      INTO v_profile_id, v_escola_id, v_nome, v_email
      FROM public.usuarios_biblioteca ub
     WHERE ub.user_id = auth.uid()
     ORDER BY ub.updated_at DESC NULLS LAST, ub.created_at DESC
     LIMIT 1;

    IF v_email IS NULL THEN
      SELECT au.email
        INTO v_email
        FROM auth.users au
       WHERE au.id = auth.uid();
    END IF;

    NEW.sender_profile_id := v_profile_id;
    NEW.escola_id := v_escola_id;
    NEW.sender_nome := COALESCE(NULLIF(trim(v_nome), ''), NULLIF(trim(NEW.sender_nome), ''));
    NEW.sender_email := COALESCE(NULLIF(trim(v_email), ''), NULLIF(trim(NEW.sender_email), ''));
    NEW.sender_role := COALESCE(NULLIF(trim(v_role), ''), NULLIF(trim(NEW.sender_role), ''));
    NEW.updated_at := now();
  ELSE
    NEW.updated_at := now();

    IF NEW.status <> OLD.status AND NEW.status <> 'nova' AND NEW.lida_em IS NULL THEN
      NEW.lida_em := now();
    END IF;

    IF COALESCE(NEW.resposta, '') <> COALESCE(OLD.resposta, '') AND NULLIF(trim(COALESCE(NEW.resposta, '')), '') IS NOT NULL THEN
      NEW.respondida_em := now();
      IF NEW.status = 'nova' THEN
        NEW.status := 'respondida';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_reclamacao_super_admin ON public.reclamacoes_super_admin;
CREATE TRIGGER trg_sync_reclamacao_super_admin
BEFORE INSERT OR UPDATE ON public.reclamacoes_super_admin
FOR EACH ROW
EXECUTE FUNCTION public.sync_reclamacao_super_admin();

DROP POLICY IF EXISTS "Users can insert complaints to super admins" ON public.reclamacoes_super_admin;
CREATE POLICY "Users can insert complaints to super admins"
  ON public.reclamacoes_super_admin
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_user_id
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('gestor', 'bibliotecaria', 'professor', 'aluno')
    )
  );

DROP POLICY IF EXISTS "Users can view own complaints and super admins view all" ON public.reclamacoes_super_admin;
CREATE POLICY "Users can view own complaints and super admins view all"
  ON public.reclamacoes_super_admin
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = sender_user_id
    OR public.is_super_admin()
    OR COALESCE(auth.jwt() ->> 'email', '') = 'nt@gmail.com'
  );

DROP POLICY IF EXISTS "Super admins can update complaints" ON public.reclamacoes_super_admin;
CREATE POLICY "Super admins can update complaints"
  ON public.reclamacoes_super_admin
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin()
    OR COALESCE(auth.jwt() ->> 'email', '') = 'nt@gmail.com'
  )
  WITH CHECK (
    public.is_super_admin()
    OR COALESCE(auth.jwt() ->> 'email', '') = 'nt@gmail.com'
  );
