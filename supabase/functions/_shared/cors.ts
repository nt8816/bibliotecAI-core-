// Shared CORS helper for Supabase Edge Functions
// Replace wildcard '*' with origin validation

const isDev = !['production', 'prod'].includes(String(Deno.env.get('SUPABASE_ENV') || '').trim().toLowerCase());
const ALLOWED_ORIGINS = [
  'https://bibliotecai.com.br',
  'https://app.bibliotecai.com.br',
  ...(isDev ? ['http://localhost:5173', 'http://localhost:3000'] : []),
];

export function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const safeOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': safeOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  };
}

export function jsonResponse(request: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' },
    status,
  });
}

// Auth helper — verifies JWT and returns user + admin client
export async function requireAuth(request: Request, supabaseUrl: string, supabaseServiceKey: string) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return { user: null, adminClient: null, error: 'Token de autenticacao ausente.' };
  }

  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);

  const { data: { user }, error } = await adminClient.auth.getUser(token);
  if (error || !user) {
    return { user: null, adminClient: null, error: 'Token invalido ou expirado.' };
  }

  return { user, adminClient, error: null };
}
