import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, jsonResponse, requireAuth } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) });

  try {
    if (req.method !== 'POST') {
      return jsonResponse(req, { error: 'Metodo nao permitido.' }, 405);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(req, { error: 'Configuracao do servidor incompleta.' }, 500);
    }

    const { user, adminClient, error: authError } = await requireAuth(req, supabaseUrl, serviceRoleKey);
    if (authError || !user || !adminClient) {
      return jsonResponse(req, { error: authError || 'Sessao invalida.' }, 401);
    }

    const { data: roles, error: rolesError } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (rolesError) {
      return jsonResponse(req, { error: 'Nao foi possivel validar permissoes.' }, 403);
    }

    const hasSuperAdminRole = Array.isArray(roles)
      && roles.some((item) => String(item?.role || '').trim().toLowerCase() === 'super_admin');

    if (hasSuperAdminRole) {
      const { data: saAccount } = await adminClient
        .from('super_admin_accounts')
        .select('id, ativo, bloqueado')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      if (!saAccount || saAccount.ativo === false || saAccount.bloqueado === true) {
        return jsonResponse(req, { error: 'Conta de super admin inativa ou bloqueada.' }, 403);
      }
    }

    if (!hasSuperAdminRole) {
      return jsonResponse(req, { error: 'Apenas o super admin pode excluir escolas.' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const tenantId = String(body?.tenant_id || '').trim();
    const escolaId = String(body?.escola_id || '').trim();

    if (!tenantId && !escolaId) {
      return jsonResponse(req, { error: 'tenant_id ou escola_id e obrigatorio.' }, 400);
    }

    const currentUserId = String(user.id || '').trim();
    const authDeleteFailures: string[] = [];

    if (tenantId) {
      const { data, error } = await adminClient.rpc('delete_tenant_school', {
        _tenant_id: tenantId,
      });

      if (error) {
        return jsonResponse(req, { error: 'Erro ao processar exclusao do tenant.' }, 400);
      }

      const authUserIds = Array.isArray(data?.auth_user_ids) ? data.auth_user_ids : [];
      const authUserIdsToDelete = authUserIds.filter((userId: string) => String(userId || '').trim() && String(userId || '').trim() !== currentUserId);

      for (const userId of authUserIdsToDelete) {
        const normalizedUserId = String(userId || '').trim();
        if (!normalizedUserId) continue;

        const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(normalizedUserId);
        if (deleteUserError && !String(deleteUserError.message || '').toLowerCase().includes('user not found')) {
          authDeleteFailures.push(`${normalizedUserId}: Erro ao excluir usuario.`);
        }
      }

      return jsonResponse(req, {
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
      return jsonResponse(req, { error: 'Erro ao localizar escola.' }, 400);
    }

    if (!escola) {
      return jsonResponse(req, { error: 'Escola nao encontrada.' }, 404);
    }

    const { data: usersData, error: usersError } = await adminClient
      .from('usuarios_biblioteca')
      .select('user_id')
      .eq('escola_id', escolaId);

    if (usersError) {
      return jsonResponse(req, { error: 'Erro ao carregar usuarios.' }, 400);
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
          return jsonResponse(req, { error: 'Erro ao limpar dados da tabela.' }, 400);
        }
      }
    }

    const { error: tenantDeleteError } = await adminClient
      .from('tenants')
      .delete()
      .eq('escola_id', escolaId);

    if (tenantDeleteError) {
      return jsonResponse(req, { error: 'Erro ao remover tenant.' }, 400);
    }

    const { error: escolaDeleteError } = await adminClient
      .from('escolas')
      .delete()
      .eq('id', escolaId);

    if (escolaDeleteError) {
      return jsonResponse(req, { error: 'Erro ao remover escola.' }, 400);
    }

    const authUserIdsToDelete = authUserIds.filter((userId) => userId && userId !== currentUserId);

    for (const userId of authUserIdsToDelete) {
      const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(userId);
      if (deleteUserError && !String(deleteUserError.message || '').toLowerCase().includes('user not found')) {
        authDeleteFailures.push(`${userId}: Erro ao excluir usuario.`);
      }
    }

    return jsonResponse(req, {
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
    return jsonResponse(req, { error: 'Erro interno ao excluir escola.' }, 500);
  }
});
