-- Analytics tables for landing page tracking
-- Stores page views, clicks, scroll depth, sessions, and user interactions

CREATE TABLE IF NOT EXISTS analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  page_url text NOT NULL,
  element_id text DEFAULT '',
  session_id text NOT NULL,
  user_id text DEFAULT '',
  data jsonb DEFAULT '{}'::jsonb,
  viewport_w integer DEFAULT 0,
  screen_w integer DEFAULT 0,
  platform text DEFAULT '',
  user_agent text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_type ON analytics_events (event_type);
CREATE INDEX IF NOT EXISTS idx_events_page ON analytics_events (page_url);
CREATE INDEX IF NOT EXISTS idx_events_session ON analytics_events (session_id);
CREATE INDEX IF NOT EXISTS idx_events_created ON analytics_events (created_at DESC);

CREATE TABLE IF NOT EXISTS analytics_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text UNIQUE NOT NULL,
  user_id text DEFAULT '',
  started_at timestamptz DEFAULT now(),
  last_active_at timestamptz DEFAULT now(),
  page_views integer DEFAULT 0,
  max_scroll_depth integer DEFAULT 0,
  platform text DEFAULT '',
  user_agent text DEFAULT '',
  ip_hash text DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_sessions_started ON analytics_sessions (started_at DESC);

-- Disable RLS — these tables are internal, accessed only via service_role in the API gateway
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on analytics_events"
  ON analytics_events FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on analytics_sessions"
  ON analytics_sessions FOR ALL
  USING (true)
  WITH CHECK (true);
