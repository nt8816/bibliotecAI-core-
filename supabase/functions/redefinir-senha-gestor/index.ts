import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-access-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

const PASSWORD_ALLOWED_REGEX = /^[A-Za-z0-9!@#$%^&*()_+\-=.?]{6,64}$/;

type GestorPayload = {
  escola_id?: string;
  gestor_id?: string;
  nova_senha?: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ success: false, error: 'Configura??o incompleta no servidor' }, 500);
    }

    const manualUserToken = req.headers.get('x-user-access-token') || '';
    const authHeader = req.headers.get('Authorization') || '';
    const userToken = String(manualUserToken || authHeader.replace(/^Bearer\s+/i, '')).trim();

    if (!userToken) {
      return jsonResponse({ success: false, error: 'N?o autenticado' }, 401);
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${userToken}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: callerUserData, error: callerUserError } = await callerClient.auth.getUser();
    const caller = callerUserData?.user;
    if (callerUserError || !caller) {
      return jsonResponse({ success: false, error: 'Sess?o inv?lida' }, 401);
    }

    const { data: callerRoles, error: callerRolesError } = await callerClient
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id);

    if (callerRolesError) {
      return jsonResponse({ success: false, error: 'N?o foi poss?vel validar permiss?es' }, 403);
    }

    const isSuperAdmin = (callerRoles || []).some((item) => item.role === 'super_admin');
    const isFixedPlatformAdmin = String(caller.email || '').trim().toLowerCase() === 'nt@gmail.com';
    if (!isSuperAdmin && !isFixedPlatformAdmin) {
      return jsonResponse({ success: false, error: 'Sem permiss?o para redefinir senha de gestor' }, 403);
    }

    let payload: GestorPayload;
    try {
      payload = await req.json();
    } catch (_error) {
      return jsonResponse({ success: false, error: 'JSON inv?lido no corpo da requisi??o' }, 400);
    }

    const escolaId = (payload?.escola_id || '').toString().trim();
    const gestorId = (payload?.gestor_id || '').toString().trim();
    const novaSenha = (payload?.nova_senha || '').toString().trim();

    if (!escolaId) {
      return jsonResponse({ success: false, error: 'Escola n?o informada' }, 400);
    }

    if (!novaSenha || !PASSWORD_ALLOWED_REGEX.test(novaSenha)) {
      return jsonResponse(
        { success: false, error: 'Senha inv?lida. Use 6-64 caracteres (letras, n?meros e s?mbolos comuns).' },
        400,
      );
    }

    const { data: escolaInfo, error: escolaError } = await adminClient
      .from('escolas')
      .select('id, nome, gestor_id')
      .eq('id', escolaId)
      .maybeSingle();

    if (escolaError || !escolaInfo) {
      return jsonResponse({ success: false, error: 'Escola n?o encontrada' }, 404);
    }

    let gestorProfile = null;
    let gestorLookupError = null;

    const fetchGestorBy = async (column, value) => {
      const normalizedValue = String(value || '').trim();
      if (!normalizedValue) return null;

      const { data: profile, error: profileError } = await adminClient
        .from('usuarios_biblioteca')
        .select('id, nome, email, user_id, escola_id, tipo')
        .eq('escola_id', escolaId)
        .eq(column, normalizedValue)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (profileError) {
        gestorLookupError = profileError;
        return null;
      }

      return profile;
    };

    gestorProfile = await fetchGestorBy('id', gestorId);
    if (!gestorProfile) gestorProfile = await fetchGestorBy('user_id', gestorId);
    if (!gestorProfile) gestorProfile = await fetchGestorBy('user_id', String(escolaInfo.gestor_id || ''));

    if (gestorLookupError) {
      return jsonResponse({ success: false, error: gestorLookupError.message || 'N?o foi poss?vel localizar o gestor' }, 500);
    }

    const gestorAuthUserId = String(gestorProfile?.user_id || gestorId || escolaInfo?.gestor_id || '').trim();
    if (!gestorAuthUserId) {
      return jsonResponse({ success: false, error: 'Gestor n?o encontrado para esta escola' }, 404);
    }

    const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(gestorAuthUserId, {
      password: novaSenha,
    });

    if (updateAuthError) {
      return jsonResponse({ success: false, error: updateAuthError.message || 'N?o foi poss?vel redefinir a senha do gestor' }, 500);
    }

    return jsonResponse({
      success: true,
      gestor_id: gestorProfile?.id || gestorId || gestorAuthUserId,
      gestor_nome: gestorProfile?.nome || `Gestor principal${escolaInfo?.nome ? ` - ${escolaInfo.nome}` : ''}`,
      gestor_email: gestorProfile?.email || '',
      senha_temporaria: novaSenha,
    });
  } catch (error) {
    console.error('redefinir-senha-gestor error', error);
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : 'Erro inesperado' },
      500,
    );
  }
});
