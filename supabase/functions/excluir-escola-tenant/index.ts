import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-access-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Método não permitido.' }, 405);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const manualUserToken = req.headers.get('x-user-access-token') || '';
    const authHeader = req.headers.get('authorization') || '';
    const token = String(manualUserToken || authHeader.replace(/^Bearer\s+/i, '')).trim();

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Configuração do servidor incompleta.' }, 500);
    }

    if (!token) {
      return jsonResponse({ error: 'Sessão inválida. Faça login novamente.' }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user },
      error: userError,
    } = await adminClient.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse({ error: 'Sessão inválida. Faça login novamente.' }, 401);
    }

    let hasSuperAdminRole = false;

    const { data: roles, error: rolesError } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (rolesError) {
      return jsonResponse({ error: rolesError.message || 'Não foi possível validar permissões.' }, 403);
    }

    hasSuperAdminRole = Array.isArray(roles)
      && roles.some((item) => String(item?.role || '').trim().toLowerCase() === 'super_admin');

    if (!hasSuperAdminRole) {
      return jsonResponse({ error: 'Apenas o super admin pode excluir escolas.' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const tenantId = String(body?.tenant_id || '').trim();
    const escolaId = String(body?.escola_id || '').trim();

    if (!tenantId && !escolaId) {
      return jsonResponse({ error: 'tenant_id ou escola_id é obrigatório.' }, 400);
    }

    const currentUserId = String(user.id || '').trim();
    const authDeleteFailures: string[] = [];

    if (tenantId) {
      const { data, error } = await adminClient.rpc('delete_tenant_school', {
        _tenant_id: tenantId,
      });

      if (error) {
        return jsonResponse({ error: error.message || 'Não foi possível excluir a escola.' }, 400);
      }

      const authUserIds = Array.isArray(data?.auth_user_ids) ? data.auth_user_ids : [];
      const authUserIdsToDelete = authUserIds.filter((userId) => String(userId || '').trim() && String(userId || '').trim() !== currentUserId);

      for (const userId of authUserIdsToDelete) {
        const normalizedUserId = String(userId || '').trim();
        if (!normalizedUserId) continue;

        const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(normalizedUserId);
        if (deleteUserError && !String(deleteUserError.message || '').toLowerCase().includes('user not found')) {
          authDeleteFailures.push(`${normalizedUserId}: ${deleteUserError.message}`);
        }
      }

      return jsonResponse({
        success: true,
        tenant_id: data?.tenant_id || tenantId,
        escola_id: data?.escola_id || null,
        escola_nome: data?.escola_nome || null,
        schema_name: data?.schema_name || null,
        auth_deleted: authUserIdsToDelete.length - authDeleteFailures.length,
        auth_skipped_current_user: authUserIdsToDelete.length !== authUserIds.length,
        auth_delete_failures: authDeleteFailures,
      });
    }

    const { data: escola, error: escolaError } = await adminClient
      .from('escolas')
      .select('id, nome')
      .eq('id', escolaId)
      .maybeSingle();

    if (escolaError) {
      return jsonResponse({ error: escolaError.message || 'Não foi possível localizar a escola.' }, 400);
    }

    if (!escola) {
      return jsonResponse({ error: 'Escola não encontrada.' }, 404);
    }

    const { data: usersData, error: usersError } = await adminClient
      .from('usuarios_biblioteca')
      .select('user_id')
      .eq('escola_id', escolaId);

    if (usersError) {
      return jsonResponse({ error: usersError.message || 'Não foi possível carregar os usuários da escola.' }, 400);
    }

    const authUserIds = Array.isArray(usersData)
      ? usersData.map((item) => String(item?.user_id || '').trim()).filter(Boolean)
      : [];

    const tablesByEscolaId = [
      'atividade_entregas',
      'atividades_leitura',
      'audiobooks_biblioteca',
      'arquivos_aula_posts',
      'categorias_livros',
      'comunidade_quiz_tentativas',
      'comunidade_posts',
      'emprestimos',
      'laboratorio_criacoes',
      'livros',
      'professor_turmas',
      'salas_cursos',
      'solicitacoes_emprestimo',
      'tenant_admin_invites',
      'tokens_convite',
      'usuarios_biblioteca',
    ];

    for (const tableName of tablesByEscolaId) {
      const { error: tableDeleteError } = await adminClient
        .from(tableName)
        .delete()
        .eq('escola_id', escolaId);

      if (tableDeleteError) {
        const message = `${tableDeleteError.message || ''} ${tableDeleteError.details || ''}`.toLowerCase();
        const isMissingTable =
          message.includes('relation')
          || message.includes('does not exist')
          || message.includes('schema cache')
          || message.includes('could not find the table');

        if (!isMissingTable) {
          return jsonResponse({ error: tableDeleteError.message || `Não foi possível limpar ${tableName}.` }, 400);
        }
      }
    }

    const { error: tenantDeleteError } = await adminClient
      .from('tenants')
      .delete()
      .eq('escola_id', escolaId);

    if (tenantDeleteError) {
      return jsonResponse({ error: tenantDeleteError.message || 'Não foi possível remover o tenant vinculado.' }, 400);
    }

    const { error: escolaDeleteError } = await adminClient
      .from('escolas')
      .delete()
      .eq('id', escolaId);

    if (escolaDeleteError) {
      return jsonResponse({ error: escolaDeleteError.message || 'Não foi possível remover a escola.' }, 400);
    }

    const authUserIdsToDelete = authUserIds.filter((userId) => userId && userId !== currentUserId);

    for (const userId of authUserIdsToDelete) {
      const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(userId);
      if (deleteUserError && !String(deleteUserError.message || '').toLowerCase().includes('user not found')) {
        authDeleteFailures.push(`${userId}: ${deleteUserError.message}`);
      }
    }

    return jsonResponse({
      success: true,
      tenant_id: null,
      escola_id: escolaId,
      escola_nome: escola.nome || null,
      schema_name: null,
      auth_deleted: authUserIdsToDelete.length - authDeleteFailures.length,
      auth_skipped_current_user: authUserIdsToDelete.length !== authUserIds.length,
      auth_delete_failures: authDeleteFailures,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return jsonResponse({ error: message }, 500);
  }
});
