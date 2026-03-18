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

    const normalizedEmail = String(user.email || '').trim().toLowerCase();
    const fixedPlatformAdmin = normalizedEmail === 'nt@gmail.com';
    let hasSuperAdminRole = false;

    if (!fixedPlatformAdmin) {
      const { data: roles, error: rolesError } = await adminClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (rolesError) {
        return jsonResponse({ error: rolesError.message || 'Não foi possível validar permissões.' }, 403);
      }

      hasSuperAdminRole = Array.isArray(roles)
        && roles.some((item) => String(item?.role || '').trim().toLowerCase() === 'super_admin');
    }

    if (!fixedPlatformAdmin && !hasSuperAdminRole) {
      return jsonResponse({ error: 'Apenas o super admin pode excluir escolas.' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const tenantId = String(body?.tenant_id || '').trim();
    if (!tenantId) {
      return jsonResponse({ error: 'tenant_id é obrigatório.' }, 400);
    }

    const { data, error } = await adminClient.rpc('delete_tenant_school', {
      _tenant_id: tenantId,
    });

    if (error) {
      return jsonResponse({ error: error.message || 'Não foi possível excluir a escola.' }, 400);
    }

    const authUserIds = Array.isArray(data?.auth_user_ids) ? data.auth_user_ids : [];
    const currentUserId = String(user.id || '').trim();
    const authUserIdsToDelete = authUserIds.filter((userId) => String(userId || '').trim() && String(userId || '').trim() !== currentUserId);
    const authDeleteFailures: string[] = [];

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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return jsonResponse({ error: message }, 500);
  }
});
