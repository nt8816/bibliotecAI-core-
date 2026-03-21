BEGIN;

DO $$
BEGIN
  IF to_regclass('public.system_logs') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Platform admins read system logs" ON public.system_logs;

    EXECUTE $policy$
      CREATE POLICY "Platform admins read system logs"
        ON public.system_logs
        FOR SELECT
        TO authenticated
        USING (
          public.is_super_admin()
          OR public.is_tenant_platform_admin()
          OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'nt@gmail.com'
        )
    $policy$;
  END IF;
END
$$;

COMMIT;
