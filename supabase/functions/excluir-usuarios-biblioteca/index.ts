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
    const isGestor = (callerRoles || []).some((item) => item.role === 'gestor');
    const isBibliotecaria = (callerRoles || []).some((item) => item.role === 'bibliotecaria');
    const hasElevatedAccess = isSuperAdmin;

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
    const explicitUserIds = Array.isArray(payload?.user_ids)
      ? payload.user_ids.map((item) => String(item || '').trim()).filter(Boolean)
      : payload?.user_id
        ? [String(payload.user_id).trim()]
        : [];
    const requestedUserIds = [...new Set([...explicitUserIds, ...ids])];

    if (ids.length === 0 && requestedUserIds.length === 0) {
      return jsonResponse({ success: false, error: 'Nenhum usuario informado para exclusao' }, 400);
    }

    const foundProfilesByKey = new Map<string, { id: string; user_id: string | null; escola_id: string | null; tipo: string | null }>();

    if (ids.length > 0) {
      const { data: profilesById, error: profilesByIdError } = await adminClient
        .from('usuarios_biblioteca')
        .select('id, user_id, escola_id, tipo')
        .in('id', ids);

      if (profilesByIdError) {
        return jsonResponse({ success: false, error: 'Nao foi possivel carregar os usuarios para exclusao' }, 500);
      }

      (profilesById || []).forEach((profile) => {
        foundProfilesByKey.set(String(profile.id), profile);
      });
    }

    if (requestedUserIds.length > 0) {
      const { data: profilesByUserId, error: profilesByUserIdError } = await adminClient
        .from('usuarios_biblioteca')
        .select('id, user_id, escola_id, tipo')
        .in('user_id', requestedUserIds);

      if (profilesByUserIdError) {
        return jsonResponse({ success: false, error: 'Nao foi possivel carregar os usuarios para exclusao' }, 500);
      }

      (profilesByUserId || []).forEach((profile) => {
        foundProfilesByKey.set(String(profile.id), profile);
      });
    }

    const foundProfiles = Array.from(foundProfilesByKey.values());
    const foundTargetKeys = new Set(
      foundProfiles.flatMap((profile) => [String(profile.id || '').trim(), String(profile.user_id || '').trim()]).filter(Boolean),
    );
    const missingIds = ids.filter((id) => !foundTargetKeys.has(id));

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
    const authOnlyUserIds = requestedUserIds.filter((userId) => !foundTargetKeys.has(userId));

    authOnlyUserIds.forEach((userId) => {
      if (!userIdsToDelete.includes(userId)) {
        userIdsToDelete.push(userId);
      }
    });

    if (requestedSchoolId && authOnlyUserIds.length > 0) {
      const { data: schoolsWithTargetGestor, error: schoolsWithTargetGestorError } = await adminClient
        .from('escolas')
        .select('id, gestor_id')
        .eq('id', requestedSchoolId)
        .in('gestor_id', authOnlyUserIds);

      if (schoolsWithTargetGestorError) {
        return jsonResponse({ success: false, error: 'Nao foi possivel validar o gestor principal da escola' }, 500);
      }

      const matchedSchoolGestorIds = (schoolsWithTargetGestor || [])
        .map((school) => String(school.gestor_id || '').trim())
        .filter(Boolean);

      matchedSchoolGestorIds.forEach((userId) => {
        if (!userIdsToDelete.includes(userId)) {
          userIdsToDelete.push(userId);
        }
      });
    }

    const protectedRoles = new Set(['super_admin', 'gestor', 'bibliotecaria']);
    const protectedProfile = foundProfiles.find((profile) => protectedRoles.has(String(profile.tipo || '').trim()));
    if (protectedProfile) {
      return jsonResponse({ success: false, error: 'Contas administrativas nao podem ser excluidas por esta tela.' }, 403);
    }

    const targetUserIds = [...new Set(userIdsToDelete)];
    if (targetUserIds.length > 0) {
      const { data: targetRoles, error: targetRolesError } = await adminClient
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', targetUserIds);

      if (targetRolesError) {
        return jsonResponse({ success: false, error: 'Nao foi possivel validar as permissoes da conta a ser excluida' }, 500);
      }

      const hasProtectedRole = (targetRoles || []).some((item) => protectedRoles.has(String(item.role || '').trim()));
      if (hasProtectedRole) {
        return jsonResponse({ success: false, error: 'Contas administrativas nao podem ser excluidas por esta tela.' }, 403);
      }
    }

    if (userIdsToDelete.includes(caller.id)) {
      return jsonResponse({ success: false, error: 'Voce nao pode excluir o proprio usuario por esta tela' }, 400);
    }

    if (foundProfiles.length === 0 && userIdsToDelete.length === 0) {
      return jsonResponse({ success: false, error: 'Nenhum usuario encontrado para exclusao' }, 404);
    }

    if (userIdsToDelete.length > 0) {
      const { error: clearGestorLinkError } = await adminClient
        .from('escolas')
        .update({ gestor_id: null })
        .in('gestor_id', userIdsToDelete);

      if (clearGestorLinkError) {
        return jsonResponse({ success: false, error: 'Nao foi possivel limpar o vinculo de gestor da escola' }, 500);
      }
    }

    for (const userId of [...new Set(userIdsToDelete)]) {
      const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(userId);
      if (deleteUserError && !String(deleteUserError.message || '').toLowerCase().includes('user not found')) {
        authDeleteFailures.push(`${userId}: ${deleteUserError.message}`);
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
      deleted_auth_only_count: Math.max(userIdsToDelete.length - foundProfiles.filter((profile) => profile.user_id).length, 0),
      missing_ids: missingIds,
      deleted_ids: foundProfiles.map((profile) => profile.id),
      deleted_user_ids: [...new Set(userIdsToDelete)],
    });
  } catch (error) {
    console.error('excluir-usuarios-biblioteca error', error);
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : 'Erro inesperado' },
      500,
    );
  }
});
