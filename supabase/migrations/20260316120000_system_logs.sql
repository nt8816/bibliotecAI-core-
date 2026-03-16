-- Sistema de logs global

BEGIN;

CREATE TABLE IF NOT EXISTS public.system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  escola_id uuid REFERENCES public.escolas(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  level text NOT NULL,
  event text NOT NULL,
  message text,
  path text,
  ip text,
  user_agent text,
  input jsonb,
  output jsonb,
  context jsonb
);

CREATE INDEX IF NOT EXISTS system_logs_escola_id_idx ON public.system_logs (escola_id);
CREATE INDEX IF NOT EXISTS system_logs_created_at_idx ON public.system_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS system_logs_level_idx ON public.system_logs (level);
CREATE INDEX IF NOT EXISTS system_logs_event_idx ON public.system_logs (event);

ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins read system logs" ON public.system_logs;
CREATE POLICY "Platform admins read system logs"
  ON public.system_logs
  FOR SELECT
  USING (public.is_tenant_platform_admin());

CREATE OR REPLACE FUNCTION public.get_request_header(_name text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value
  FROM jsonb_each_text(coalesce(current_setting('request.headers', true), '{}')::jsonb)
  WHERE lower(key) = lower(_name)
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_request_ip()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(split_part(public.get_request_header('x-forwarded-for'), ',', 1), ''),
    public.get_request_header('cf-connecting-ip'),
    public.get_request_header('x-real-ip')
  )
$$;

CREATE OR REPLACE FUNCTION public.log_system_event(
  _event text,
  _level text DEFAULT 'info',
  _message text DEFAULT NULL,
  _path text DEFAULT NULL,
  _input jsonb DEFAULT NULL,
  _output jsonb DEFAULT NULL,
  _context jsonb DEFAULT NULL,
  _escola_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_level text := lower(coalesce(_level, 'info'));
  v_event text := coalesce(nullif(trim(_event), ''), 'unknown');
  v_ip text;
  v_ua text;
  v_escola_id uuid := _escola_id;
BEGIN
  IF v_level NOT IN ('info', 'warn', 'error') THEN
    v_level := 'info';
  END IF;

  IF v_escola_id IS NULL THEN
    v_escola_id := public.get_user_escola_id(auth.uid());
  END IF;

  v_ip := public.get_request_ip();
  v_ua := public.get_request_header('user-agent');

  INSERT INTO public.system_logs (
    escola_id,
    user_id,
    level,
    event,
    message,
    path,
    ip,
    user_agent,
    input,
    output,
    context
  ) VALUES (
    v_escola_id,
    auth.uid(),
    v_level,
    v_event,
    _message,
    _path,
    v_ip,
    v_ua,
    _input,
    _output,
    _context
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_request_header(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_request_ip() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_system_event(text, text, text, text, jsonb, jsonb, jsonb, uuid) TO anon, authenticated;

COMMIT;
