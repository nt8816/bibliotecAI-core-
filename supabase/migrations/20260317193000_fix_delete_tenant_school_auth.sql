CREATE OR REPLACE FUNCTION public.delete_tenant_school(_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant public.tenants%ROWTYPE;
  v_escola public.escolas%ROWTYPE;
  v_table record;
  v_schema_name text;
  v_auth_user_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  SELECT *
  INTO v_tenant
  FROM public.tenants
  WHERE id = _tenant_id
  LIMIT 1;

  IF v_tenant.id IS NULL THEN
    RAISE EXCEPTION 'Tenant não encontrado';
  END IF;

  IF v_tenant.escola_id IS NULL THEN
    RAISE EXCEPTION 'Tenant sem escola vinculada';
  END IF;

  SELECT *
  INTO v_escola
  FROM public.escolas
  WHERE id = v_tenant.escola_id
  LIMIT 1;

  IF v_escola.id IS NULL THEN
    RAISE EXCEPTION 'Escola não encontrada';
  END IF;

  v_schema_name := nullif(trim(v_tenant.schema_name), '');

  SELECT coalesce(
    array_agg(DISTINCT source.user_id) FILTER (WHERE source.user_id IS NOT NULL),
    ARRAY[]::uuid[]
  )
  INTO v_auth_user_ids
  FROM (
    SELECT ub.user_id
    FROM public.usuarios_biblioteca ub
    WHERE ub.escola_id = v_escola.id

    UNION ALL

    SELECT v_escola.gestor_id
  ) AS source;

  FOR v_table IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'escola_id'
      AND c.table_name NOT IN ('escolas', 'tenants')
    GROUP BY c.table_name
    ORDER BY CASE WHEN c.table_name = 'usuarios_biblioteca' THEN 1 ELSE 0 END, c.table_name
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE escola_id = $1', v_table.table_name)
    USING v_escola.id;
  END LOOP;

  DELETE FROM public.tenants
  WHERE id = v_tenant.id;

  DELETE FROM public.escolas
  WHERE id = v_escola.id;

  IF v_schema_name IS NOT NULL THEN
    EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', v_schema_name);
  END IF;

  RETURN jsonb_build_object(
    'tenant_id', v_tenant.id,
    'escola_id', v_escola.id,
    'escola_nome', v_escola.nome,
    'schema_name', v_schema_name,
    'auth_user_ids', to_jsonb(v_auth_user_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_tenant_school(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_tenant_school(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.delete_tenant_school(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tenant_school(uuid) TO service_role;
