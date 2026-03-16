-- Rate limit para chamadas de IA

BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count integer NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_rate_limits_window_start_idx ON public.ai_rate_limits (window_start);

CREATE OR REPLACE FUNCTION public.check_ai_rate_limit(
  _key text,
  _limit integer,
  _window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_window interval := make_interval(secs => greatest(1, _window_seconds));
  v_allowed boolean;
BEGIN
  INSERT INTO public.ai_rate_limits (key, window_start, count)
  VALUES (_key, v_now, 1)
  ON CONFLICT (key) DO UPDATE
  SET
    window_start = CASE
      WHEN public.ai_rate_limits.window_start < (v_now - v_window) THEN v_now
      ELSE public.ai_rate_limits.window_start
    END,
    count = CASE
      WHEN public.ai_rate_limits.window_start < (v_now - v_window) THEN 1
      ELSE public.ai_rate_limits.count + 1
    END;

  SELECT count <= _limit INTO v_allowed
  FROM public.ai_rate_limits
  WHERE key = _key;

  RETURN v_allowed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_ai_rate_limit(text, integer, integer) TO anon, authenticated;

COMMIT;
