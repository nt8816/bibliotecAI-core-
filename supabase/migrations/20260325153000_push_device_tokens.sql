CREATE TABLE IF NOT EXISTS public.push_device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  profile_id UUID NULL REFERENCES public.usuarios_biblioteca(id) ON DELETE CASCADE,
  escola_id UUID NULL REFERENCES public.escolas(id) ON DELETE CASCADE,
  role TEXT NULL,
  token TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'fcm',
  platform TEXT NOT NULL DEFAULT 'android',
  device_label TEXT NULL,
  app_version TEXT NULL,
  channels TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS push_device_tokens_user_idx ON public.push_device_tokens(user_id);
CREATE INDEX IF NOT EXISTS push_device_tokens_profile_idx ON public.push_device_tokens(profile_id);
CREATE INDEX IF NOT EXISTS push_device_tokens_escola_idx ON public.push_device_tokens(escola_id);
CREATE INDEX IF NOT EXISTS push_device_tokens_active_idx ON public.push_device_tokens(active);

ALTER TABLE public.push_device_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own push tokens" ON public.push_device_tokens;
CREATE POLICY "Users can view own push tokens"
  ON public.push_device_tokens
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own push tokens" ON public.push_device_tokens;
CREATE POLICY "Users can insert own push tokens"
  ON public.push_device_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own push tokens" ON public.push_device_tokens;
CREATE POLICY "Users can update own push tokens"
  ON public.push_device_tokens
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own push tokens" ON public.push_device_tokens;
CREATE POLICY "Users can delete own push tokens"
  ON public.push_device_tokens
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_push_device_tokens_updated_at ON public.push_device_tokens;
CREATE TRIGGER update_push_device_tokens_updated_at
  BEFORE UPDATE ON public.push_device_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
