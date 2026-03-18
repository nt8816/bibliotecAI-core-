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

const normalizeText = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

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

    if (!isSuperAdmin && !isGestor && !isBibliotecaria) {
      return jsonResponse({ success: false, error: 'Sem permissao para excluir sala' }, 403);
    }

    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from('usuarios_biblioteca')
      .select('id, escola_id')
      .eq('user_id', caller.id)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (callerProfileError || (!isSuperAdmin && !callerProfile?.escola_id)) {
      return jsonResponse({ success: false, error: 'Nao foi possivel validar a escola do solicitante' }, 403);
    }

    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
    } catch {
      return jsonResponse({ success: false, error: 'JSON invalido no corpo da requisicao' }, 400);
    }

    const salaId = String(payload?.sala_id || payload?.id || '').trim();
    const salaNomeFallback = String(payload?.sala_nome || payload?.nome || '').trim();
    if (!salaId && !salaNomeFallback) {
      return jsonResponse({ success: false, error: 'Sala nao informada para exclusao' }, 400);
    }

    let sala = null;

    if (salaId) {
      const { data: salaData, error: salaError } = await adminClient
        .from('salas_cursos')
        .select('id, escola_id, nome, tipo')
        .eq('id', salaId)
        .maybeSingle();

      if (salaError || !salaData) {
        return jsonResponse({ success: false, error: 'Sala nao encontrada' }, 404);
      }

      sala = salaData;
    } else {
      sala = {
        id: null,
        escola_id: callerProfile?.escola_id || null,
        nome: salaNomeFallback,
        tipo: 'sala',
      };
    }

    if (!isSuperAdmin && sala.escola_id !== callerProfile?.escola_id) {
      return jsonResponse({ success: false, error: 'Voce nao pode excluir salas de outra escola' }, 403);
    }

    const { data: profiles, error: profilesError } = await adminClient
      .from('usuarios_biblioteca')
      .select('id, user_id, escola_id, sala_curso_id, turma')
      .eq('escola_id', sala.escola_id);

    if (profilesError) {
      return jsonResponse({ success: false, error: 'Nao foi possivel carregar os usuarios da sala' }, 500);
    }

    const salaKey = normalizeText(sala.nome);
    const targetProfiles = (profiles || []).filter((profile) =>
      profile.sala_curso_id === sala.id || normalizeText(profile.turma) === salaKey,
    );

    const selfProfile = targetProfiles.find((profile) => profile.user_id === caller.id);
    if (selfProfile) {
      return jsonResponse({ success: false, error: 'Voce nao pode excluir a propria sala enquanto estiver vinculado a ela' }, 400);
    }

    const authDeleteFailures: string[] = [];
    for (const profile of targetProfiles) {
      const userId = String(profile.user_id || '').trim();
      if (!userId) continue;

      const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(userId);
      if (deleteUserError && !String(deleteUserError.message || '').toLowerCase().includes('user not found')) {
        authDeleteFailures.push(`${profile.id}: ${deleteUserError.message}`);
      }
    }

    if (authDeleteFailures.length > 0) {
      return jsonResponse({ success: false, error: `Falha ao excluir contas da sala: ${authDeleteFailures.join(' | ')}` }, 500);
    }

    const targetProfileIds = targetProfiles.map((profile) => profile.id);
    if (targetProfileIds.length > 0) {
      const { error: deleteProfilesError } = await adminClient
        .from('usuarios_biblioteca')
        .delete()
        .in('id', targetProfileIds);

      if (deleteProfilesError) {
        return jsonResponse({ success: false, error: 'Nao foi possivel excluir os perfis da sala' }, 500);
      }
    }

    const { error: deleteProfessorTurmasError } = await adminClient
      .from('professor_turmas')
      .delete()
      .eq('escola_id', sala.escola_id)
      .eq('turma', sala.nome);

    if (deleteProfessorTurmasError) {
      return jsonResponse({ success: false, error: 'Nao foi possivel excluir os vinculos de professores da sala' }, 500);
    }

    if (sala.id) {
      const { error: deleteSalaError } = await adminClient
        .from('salas_cursos')
        .delete()
        .eq('id', sala.id);

      if (deleteSalaError) {
        return jsonResponse({ success: false, error: 'Nao foi possivel excluir a sala' }, 500);
      }
    }

    return jsonResponse({
      success: true,
      sala_id: sala.id,
      sala_nome: sala.nome,
      deleted_user_profiles: targetProfileIds.length,
    });
  } catch (error) {
    console.error('excluir-sala-escola error', error);
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : 'Erro inesperado' },
      500,
    );
  }
});
