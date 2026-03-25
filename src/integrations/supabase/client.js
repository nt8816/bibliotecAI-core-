import { createClient } from '@supabase/supabase-js';

import { addPlatformSessionListener, getPlatformAccessToken } from '@/lib/platformSession';

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();

let supabaseClient = null;
let stopSessionSync = null;

function getRealtimeAuthToken() {
  return getPlatformAccessToken() || SUPABASE_ANON_KEY;
}

export function getSupabaseRealtimeClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });

    supabaseClient.realtime.setAuth(getRealtimeAuthToken());

    stopSessionSync = addPlatformSessionListener((session) => {
      supabaseClient?.realtime.setAuth(session?.access_token || SUPABASE_ANON_KEY);
    });
  }

  return supabaseClient;
}

export function cleanupSupabaseRealtimeClient() {
  stopSessionSync?.();
  stopSessionSync = null;
  supabaseClient = null;
}
