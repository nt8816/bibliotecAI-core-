BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'super_admin_challenge_kind'
  ) THEN
    CREATE TYPE public.super_admin_challenge_kind AS ENUM (
      'passkey_registration',
      'passkey_authentication',
      'desktop_access',
      'email_verification'
    );
  END IF;
END $$;

ALTER TABLE public.super_admin_accounts
  ADD COLUMN IF NOT EXISTS passkey_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS passkey_enrolled_at timestamptz,
  ADD COLUMN IF NOT EXISTS ultimo_ip text,
  ADD COLUMN IF NOT EXISTS ultima_regiao text,
  ADD COLUMN IF NOT EXISTS ultimo_dispositivo text,
  ADD COLUMN IF NOT EXISTS ultimo_mfa_em timestamptz,
  ADD COLUMN IF NOT EXISTS ultimo_email_verificado_em timestamptz;

CREATE TABLE IF NOT EXISTS public.super_admin_passkeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.super_admin_accounts(id) ON DELETE CASCADE,
  credential_id text NOT NULL UNIQUE,
  credential_public_key_jwk jsonb NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  transports text[] NOT NULL DEFAULT '{}',
  device_label text,
  backed_up boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS super_admin_passkeys_account_id_idx
  ON public.super_admin_passkeys (account_id);

CREATE INDEX IF NOT EXISTS super_admin_passkeys_active_idx
  ON public.super_admin_passkeys (account_id, revoked_at);

ALTER TABLE public.super_admin_passkeys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins read super admin passkeys" ON public.super_admin_passkeys;
CREATE POLICY "Platform admins read super admin passkeys"
  ON public.super_admin_passkeys
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_tenant_platform_admin()
  );

DROP POLICY IF EXISTS "Platform admins manage super admin passkeys" ON public.super_admin_passkeys;
CREATE POLICY "Platform admins manage super admin passkeys"
  ON public.super_admin_passkeys
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_tenant_platform_admin()
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.is_tenant_platform_admin()
  );

CREATE TABLE IF NOT EXISTS public.super_admin_access_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.super_admin_accounts(id) ON DELETE CASCADE,
  kind public.super_admin_challenge_kind NOT NULL,
  challenge_hash text NOT NULL,
  token_hash text,
  device_type text NOT NULL DEFAULT 'unknown',
  origin_ip text,
  origin_region text,
  origin_city text,
  user_agent text,
  requires_email_verification boolean NOT NULL DEFAULT false,
  email_code_hash text,
  email_code_expires_at timestamptz,
  email_verified_at timestamptz,
  approved_at timestamptz,
  approved_by_account_id uuid REFERENCES public.super_admin_accounts(id) ON DELETE SET NULL,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS super_admin_access_challenges_account_idx
  ON public.super_admin_access_challenges (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS super_admin_access_challenges_token_idx
  ON public.super_admin_access_challenges (token_hash);

CREATE INDEX IF NOT EXISTS super_admin_access_challenges_active_idx
  ON public.super_admin_access_challenges (account_id, kind, approved_at, consumed_at, expires_at);

ALTER TABLE public.super_admin_access_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins read super admin access challenges" ON public.super_admin_access_challenges;
CREATE POLICY "Platform admins read super admin access challenges"
  ON public.super_admin_access_challenges
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_tenant_platform_admin()
  );

DROP POLICY IF EXISTS "Platform admins manage super admin access challenges" ON public.super_admin_access_challenges;
CREATE POLICY "Platform admins manage super admin access challenges"
  ON public.super_admin_access_challenges
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_tenant_platform_admin()
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.is_tenant_platform_admin()
  );

COMMIT;
