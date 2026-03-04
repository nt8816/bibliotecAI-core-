import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

const PASSWORD_ALLOWED_REGEX = /^[A-Za-z0-9!@#$%^&*()_+\-=.?]{6,64}$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ success: false, error: 'Configuração incompleta no servidor' }, 500);
    }

    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return jsonResponse({ success: false, error: 'Não autenticado' }, 401);
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: callerUserData, error: callerUserError } = await callerClient.auth.getUser();
    const caller = callerUserData?.user;
    if (callerUserError || !caller) {
      return jsonResponse({ success: false, error: 'Sessão inválida' }, 401);
    }

    const { data: callerRoles, error: callerRolesError } = await callerClient
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id);

    if (callerRolesError) {
      return jsonResponse({ success: false, error: 'Não foi possível validar permissões' }, 403);
    }

    const isSuperAdmin = (callerRoles || []).some((item) => item.role === 'super_admin');
    const isFixedPlatformAdmin = String(caller.email || '').trim().toLowerCase() === 'nt@gmail.com';
    if (!isSuperAdmin && !isFixedPlatformAdmin) {
      return jsonResponse({ success: false, error: 'Sem permissão para redefinir senha de gestor' }, 403);
    }

    let payload;
    try {
      payload = await req.json();
    } catch (_error) {
      return jsonResponse({ success: false, error: 'JSON inválido no corpo da requisição' }, 400);
    }

    const escolaId = (payload?.escola_id || '').toString().trim();
    const novaSenha = (payload?.nova_senha || '').toString().trim();

    if (!escolaId) {
      return jsonResponse({ success: false, error: 'Escola não informada' }, 400);
    }

    if (!novaSenha || !PASSWORD_ALLOWED_REGEX.test(novaSenha)) {
      return jsonResponse(
        { success: false, error: 'Senha inválida. Use 6-64 caracteres (letras, números e símbolos comuns).' },
        400,
      );
    }

    const { data: gestorProfile, error: gestorError } = await adminClient
      .from('usuarios_biblioteca')
      .select('id, nome, email, user_id, escola_id')
      .eq('escola_id', escolaId)
      .eq('tipo', 'gestor')
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (gestorError || !gestorProfile) {
      return jsonResponse({ success: false, error: 'Gestor não encontrado para esta escola' }, 404);
    }

    if (!gestorProfile.user_id) {
      return jsonResponse({ success: false, error: 'Este gestor ainda não ativou conta. Não há senha para redefinir.' }, 400);
    }

    const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(gestorProfile.user_id, {
      password: novaSenha,
    });

    if (updateAuthError) {
      return jsonResponse({ success: false, error: 'Não foi possível redefinir a senha do gestor' }, 500);
    }

    return jsonResponse({
      success: true,
      gestor_id: gestorProfile.id,
      gestor_nome: gestorProfile.nome,
      gestor_email: gestorProfile.email,
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
