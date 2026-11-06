BEGIN;

DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT namespace.nspname AS schema_name, relation.relname AS table_name
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE relation.relkind IN ('r', 'p')
      AND (namespace.nspname = 'public' OR starts_with(namespace.nspname, 'tenant_'))
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend dependency
        WHERE dependency.classid = 'pg_class'::regclass
          AND dependency.objid = relation.oid
          AND dependency.deptype = 'e'
      )
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', target.schema_name, target.table_name);
    EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM PUBLIC, anon', target.schema_name, target.table_name);
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE %I.%I FROM authenticated', target.schema_name, target.table_name);
  END LOOP;
END;
$$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;

CREATE OR REPLACE FUNCTION public.enable_application_table_rls()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT command.objid, command.schema_name
    FROM pg_event_trigger_ddl_commands() command
    JOIN pg_class relation ON relation.oid = command.objid
    WHERE command.classid = 'pg_class'::regclass
      AND relation.relkind IN ('r', 'p')
      AND NOT command.in_extension
      AND (command.schema_name = 'public' OR starts_with(command.schema_name, 'tenant_'))
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target.objid::regclass);
    EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC, anon', target.objid::regclass);
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE %s FROM authenticated', target.objid::regclass);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.enable_application_table_rls() FROM PUBLIC, anon, authenticated;

DROP EVENT TRIGGER IF EXISTS bibliotecai_enable_table_rls;
CREATE EVENT TRIGGER bibliotecai_enable_table_rls
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION public.enable_application_table_rls();

DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT relation.relname AS table_name
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_attribute attribute ON attribute.attrelid = relation.oid
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND attribute.attname = 'escola_id'
      AND attribute.atttypid = 'uuid'::regtype
      AND NOT attribute.attisdropped
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS school_boundary ON public.%I', target.table_name);
    EXECUTE format(
      'CREATE POLICY school_boundary ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
       USING (public.is_super_admin() OR public.is_same_escola(escola_id))
       WITH CHECK (public.is_super_admin() OR public.is_same_escola(escola_id))',
      target.table_name
    );
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "Anyone can view valid token by token value" ON public.tokens_convite;

DROP POLICY IF EXISTS privileged_invite_boundary ON public.tokens_convite;
CREATE POLICY privileged_invite_boundary ON public.tokens_convite
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR (role_destino <> 'super_admin'::public.app_role
        AND (public.is_gestor() OR role_destino <> 'gestor'::public.app_role))
  )
  WITH CHECK (
    public.is_super_admin()
    OR (role_destino <> 'super_admin'::public.app_role
        AND (public.is_gestor() OR role_destino <> 'gestor'::public.app_role))
  );

DROP POLICY IF EXISTS privileged_role_boundary ON public.user_roles;
CREATE POLICY privileged_role_boundary ON public.user_roles
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR (role <> 'super_admin'::public.app_role
        AND (user_id = auth.uid() OR public.is_same_user_escola(user_id)))
  )
  WITH CHECK (
    public.is_super_admin()
    OR (role <> 'super_admin'::public.app_role
        AND public.is_gestor() AND public.is_same_user_escola(user_id))
  );

CREATE OR REPLACE FUNCTION public.protect_profile_security_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF current_user <> 'authenticated' OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.escola_id IS DISTINCT FROM OLD.escola_id THEN
      RAISE EXCEPTION 'Vínculo de autenticação e escola só podem ser alterados pelo servidor'
        USING ERRCODE = '42501';
    END IF;

    IF NOT (public.is_gestor() OR public.is_bibliotecaria()) AND NEW.tipo IS DISTINCT FROM OLD.tipo THEN
      RAISE EXCEPTION 'Usuário não pode alterar o próprio perfil de acesso'
        USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_gestor() AND OLD.tipo IN ('gestor'::public.app_role, 'super_admin'::public.app_role) THEN
      RAISE EXCEPTION 'Somente gestor pode alterar perfil de gestor'
        USING ERRCODE = '42501';
    END IF;

    IF OLD.tipo = 'super_admin'::public.app_role THEN
      RAISE EXCEPTION 'Somente super admin pode alterar este perfil'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.tipo = 'super_admin'::public.app_role
     OR (NEW.tipo = 'gestor'::public.app_role AND NOT public.is_gestor()) THEN
    RAISE EXCEPTION 'Sem permissão para atribuir este perfil de acesso'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_profile_security_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_profile_security_fields ON public.usuarios_biblioteca;
CREATE TRIGGER protect_profile_security_fields
  BEFORE INSERT OR UPDATE ON public.usuarios_biblioteca
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_security_fields();

REVOKE ALL ON public.ai_rate_limits, public.auth_session_handoffs,
  public.analytics_events, public.analytics_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_rate_limits, public.auth_session_handoffs,
  public.analytics_events, public.analytics_sessions TO service_role;

REVOKE ALL ON FUNCTION public.check_ai_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_ai_rate_limit(text, integer, integer) TO service_role;

COMMIT;
