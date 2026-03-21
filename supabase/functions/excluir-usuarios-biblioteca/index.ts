import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-access-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ success: false, error: 'Configuracao incompleta no servidor' }, 500);
    }

    const rawToken = req.headers.get('x-user-access-token') || req.headers.get('Authorization') || '';
    const authHeader = rawToken.toLowerCase().startsWith('bearer ') ? rawToken : `Bearer ${rawToken}`;
    if (!rawToken) {
      return jsonResponse({ success: false, error: 'Nao autenticado' }, 401);
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
      return jsonResponse({ success: false, error: 'Sessao invalida' }, 401);
    }

    const { data: callerRoles, error: callerRolesError } = await callerClient
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id);

    if (callerRolesError) {
      return jsonResponse({ success: false, error: 'Nao foi possivel validar permissoes' }, 403);
    }

    const isSuperAdmin = (callerRoles || []).some((item) => item.role === 'super_admin');
    const isFixedPlatformAdmin = String(caller.email || '').trim().toLowerCase() === 'nt@gmail.com';
    const isGestor = (callerRoles || []).some((item) => item.role === 'gestor');
    const isBibliotecaria = (callerRoles || []).some((item) => item.role === 'bibliotecaria');
    const hasElevatedAccess = isSuperAdmin || isFixedPlatformAdmin;

    if (!hasElevatedAccess && !isGestor && !isBibliotecaria) {
      return jsonResponse({ success: false, error: 'Sem permissao para excluir usuarios' }, 403);
    }

    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
    } catch {
      return jsonResponse({ success: false, error: 'JSON invalido no corpo da requisicao' }, 400);
    }

    const requestedSchoolId = String(payload?.escola_id || '').trim();

    const { data: callerProfile, error: callerProfileError } = hasElevatedAccess
      ? { data: null, error: null }
      : await adminClient
        .from('usuarios_biblioteca')
        .select('id, escola_id')
        .eq('user_id', caller.id)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (callerProfileError || (!hasElevatedAccess && !callerProfile?.escola_id)) {
      return jsonResponse({ success: false, error: 'Nao foi possivel validar a escola do solicitante' }, 403);
    }

    if (!hasElevatedAccess && requestedSchoolId && callerProfile?.escola_id !== requestedSchoolId) {
      return jsonResponse({ success: false, error: 'Voce nao pode excluir usuarios de outra escola' }, 403);
    }

    const ids = Array.isArray(payload?.ids)
      ? payload.ids.map((item) => String(item || '').trim()).filter(Boolean)
      : payload?.id
        ? [String(payload.id).trim()]
        : [];

    if (ids.length === 0) {
      return jsonResponse({ success: false, error: 'Nenhum usuario informado para exclusao' }, 400);
    }

    const { data: profiles, error: profilesError } = await adminClient
      .from('usuarios_biblioteca')
      .select('id, user_id, escola_id')
      .in('id', ids);

    if (profilesError) {
      return jsonResponse({ success: false, error: 'Nao foi possivel carregar os usuarios para exclusao' }, 500);
    }

    const foundProfiles = profiles || [];
    const foundIds = new Set(foundProfiles.map((item) => item.id));
    const missingIds = ids.filter((id) => !foundIds.has(id));

    const forbiddenProfile = foundProfiles.find((profile) =>
      !hasElevatedAccess && profile.escola_id !== callerProfile?.escola_id,
    );
    if (forbiddenProfile) {
      return jsonResponse({ success: false, error: 'Voce nao pode excluir usuarios de outra escola' }, 403);
    }

    const selfProfile = foundProfiles.find((profile) => profile.user_id === caller.id);
    if (selfProfile) {
      return jsonResponse({ success: false, error: 'Voce nao pode excluir o proprio usuario por esta tela' }, 400);
    }

    const authDeleteFailures: string[] = [];
    const userIdsToDelete = foundProfiles
      .map((profile) => String(profile.user_id || '').trim())
      .filter(Boolean);

    if (userIdsToDelete.length > 0) {
      const { error: clearGestorLinkError } = await adminClient
        .from('escolas')
        .update({ gestor_id: null })
        .in('gestor_id', userIdsToDelete);

      if (clearGestorLinkError) {
        return jsonResponse({ success: false, error: 'Nao foi possivel limpar o vinculo de gestor da escola' }, 500);
      }
    }

    for (const profile of foundProfiles) {
      const userId = String(profile.user_id || '').trim();
      if (!userId) continue;

      const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(userId);
      if (deleteUserError && !String(deleteUserError.message || '').toLowerCase().includes('user not found')) {
        authDeleteFailures.push(`${profile.id}: ${deleteUserError.message}`);
      }
    }

    if (authDeleteFailures.length > 0) {
      return jsonResponse({ success: false, error: `Falha ao excluir contas de autenticacao: ${authDeleteFailures.join(' | ')}` }, 500);
    }

    const profileIdsToDelete = foundProfiles
      .map((profile) => String(profile.id || '').trim())
      .filter(Boolean);

    if (profileIdsToDelete.length > 0) {
      const { error: deleteProfilesError } = await adminClient
        .from('usuarios_biblioteca')
        .delete()
        .in('id', profileIdsToDelete);

      if (deleteProfilesError) {
        return jsonResponse({ success: false, error: 'Nao foi possivel excluir perfis sem autenticacao' }, 500);
      }
    }

    return jsonResponse({
      success: true,
      deleted_count: foundProfiles.length,
      missing_ids: missingIds,
      deleted_ids: foundProfiles.map((profile) => profile.id),
    });
  } catch (error) {
    console.error('excluir-usuarios-biblioteca error', error);
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : 'Erro inesperado' },
      500,
    );
  }
});
