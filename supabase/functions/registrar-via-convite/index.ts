import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_REGEX = /^[a-f0-9]{32,128}$/;
const MATRICULA_REGEX = /^[A-Za-z0-9._-]{6,32}$/;

const releaseTokenReservation = async (supabaseAdmin, tokenId) => {
  if (!tokenId) return;
  await supabaseAdmin
    .from('tokens_convite')
    .update({ ativo: true })
    .eq('id', tokenId)
    .is('usado_por', null);
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let payload;
    try {
      payload = await req.json();
    } catch (_error) {
      return jsonResponse({ success: false, error: 'JSON inválido no corpo da requisição' }, 400);
    }

    const { token, nome, email, senha, matricula } = payload;

    const normalizedToken = (token || '').toString().trim().toLowerCase();
    const normalizedNome = (nome || '').toString().trim();

    if (!normalizedToken || !normalizedNome) {
      return jsonResponse({ success: false, error: 'Dados incompletos' }, 400);
    }

    if (!TOKEN_REGEX.test(normalizedToken)) {
      return jsonResponse({ success: false, error: 'Token inválido' }, 400);
    }

    if (normalizedNome.length < 3 || normalizedNome.length > 120) {
      return jsonResponse({ success: false, error: 'Nome inválido' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        { success: false, error: 'Configuração do servidor incompleta para registrar convite' },
        500
      );
    }

    // Create admin client with service role
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Atomically reserve token to avoid concurrent re-use during signup.
    const nowIso = new Date().toISOString();
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from('tokens_convite')
      .update({ ativo: false })
      .eq('token', normalizedToken)
      .eq('ativo', true)
      .is('usado_por', null)
      .gt('expira_em', nowIso)
      .select('id, role_destino, escola_id')
      .maybeSingle();

    if (tokenError || !tokenData) {
      console.error('Token verification error:', tokenError);
      return jsonResponse({ success: false, error: 'Token inválido ou expirado' }, 400);
    }

    const allowedRoles = ['professor', 'bibliotecaria', 'aluno'];
    if (!allowedRoles.includes(tokenData.role_destino)) {
      await releaseTokenReservation(supabaseAdmin, tokenData.id);
      return jsonResponse(
        { success: false, error: 'Este token não permite cadastro para este tipo de usuário' },
        400
      );
    }

    const isAluno = tokenData.role_destino === 'aluno';
    const normalizedMatricula = (matricula || '').toString().trim();
    const authEmail = isAluno
      ? `${normalizedMatricula.replace(/\s+/g, '')}@temp.bibliotecai.com`
      : (email || '').toString().trim().toLowerCase();
    const authPassword = isAluno ? normalizedMatricula : (senha || '');

    if (!authEmail || !authPassword) {
      await releaseTokenReservation(supabaseAdmin, tokenData.id);
      return jsonResponse({ success: false, error: 'Dados incompletos para criação da conta' }, 400);
    }

    if (isAluno && !MATRICULA_REGEX.test(normalizedMatricula)) {
      await releaseTokenReservation(supabaseAdmin, tokenData.id);
      return jsonResponse({ success: false, error: 'Matrícula é obrigatória para aluno' }, 400);
    }

    if (!isAluno && !EMAIL_REGEX.test(authEmail)) {
      await releaseTokenReservation(supabaseAdmin, tokenData.id);
      return jsonResponse({ success: false, error: 'E-mail inválido' }, 400);
    }

    if (authPassword.length < 6) {
      await releaseTokenReservation(supabaseAdmin, tokenData.id);
      return jsonResponse(
        { success: false, error: 'A senha deve ter pelo menos 6 caracteres (matrícula mínima de 6).' },
        400
      );
    }

    // 2. Create user in auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: authEmail,
      password: authPassword,
      email_confirm: true,
      user_metadata: { nome: normalizedNome },
    });

    if (authError) {
      console.error('Auth error:', authError);
      await releaseTokenReservation(supabaseAdmin, tokenData.id);
      return jsonResponse({ success: false, error: authError.message }, 400);
    }

    const userId = authData.user.id;

    // 3. Ensure a single role for the user in user_roles
    // user_roles has UNIQUE (user_id, role), not UNIQUE (user_id).
    // We remove stale roles first, then upsert on the actual unique key.
    const { error: deleteRoleError } = await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', userId)
      .neq('role', tokenData.role_destino);

    if (deleteRoleError) {
      console.error('Role cleanup error:', deleteRoleError);
      await supabaseAdmin.auth.admin.deleteUser(userId).catch((cleanupError) =>
        console.error('Cleanup auth user error (role cleanup step):', cleanupError)
      );
      await releaseTokenReservation(supabaseAdmin, tokenData.id);
      return jsonResponse({ success: false, error: 'Não foi possível preparar a função do usuário' }, 500);
    }

    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .upsert(
        { user_id: userId, role: tokenData.role_destino },
        { onConflict: 'user_id,role' }
      );

    if (roleError) {
      console.error('Role update error:', roleError);
      await supabaseAdmin.auth.admin.deleteUser(userId).catch((cleanupError) =>
        console.error('Cleanup auth user error (role step):', cleanupError)
      );
      await releaseTokenReservation(supabaseAdmin, tokenData.id);
      return jsonResponse({ success: false, error: 'Não foi possível definir a função do usuário' }, 500);
    }

    // 4. Create or update profile in usuarios_biblioteca
    // This table does not have UNIQUE(user_id), so onConflict user_id is invalid.
    const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
      .from('usuarios_biblioteca')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existingProfileError) {
      console.error('Profile lookup error:', existingProfileError);
      await supabaseAdmin.auth.admin.deleteUser(userId).catch((cleanupError) =>
        console.error('Cleanup auth user error (profile lookup step):', cleanupError)
      );
      await releaseTokenReservation(supabaseAdmin, tokenData.id);
      return jsonResponse({ success: false, error: 'Não foi possível localizar o perfil do usuário' }, 500);
    }

    const profilePayload = {
      user_id: userId,
      nome: normalizedNome,
      email: authEmail,
      tipo: tokenData.role_destino,
      escola_id: tokenData.escola_id,
      matricula: isAluno ? normalizedMatricula : null,
    };

    let userError = null;

    if (existingProfile) {
      const { error } = await supabaseAdmin
        .from('usuarios_biblioteca')
        .update(profilePayload)
        .eq('id', existingProfile.id);
      userError = error;
    } else if (isAluno) {
      // If an aluno profile was pre-created (import/manual) with this matricula and no user_id,
      // bind it to the new auth user instead of creating a duplicate.
      const { data: precreatedAluno, error: precreatedAlunoError } = await supabaseAdmin
        .from('usuarios_biblioteca')
        .select('id, user_id')
        .eq('matricula', normalizedMatricula)
        .maybeSingle();

      if (precreatedAlunoError) {
        userError = precreatedAlunoError;
      } else if (precreatedAluno?.id) {
        if (precreatedAluno.user_id && precreatedAluno.user_id !== userId) {
          userError = { message: 'Esta matrícula já está vinculada a outra conta' };
        } else {
          const { error } = await supabaseAdmin
            .from('usuarios_biblioteca')
            .update(profilePayload)
            .eq('id', precreatedAluno.id);
          userError = error;
        }
      } else {
        const { error } = await supabaseAdmin.from('usuarios_biblioteca').insert(profilePayload);
        userError = error;
      }
    } else {
      const { error } = await supabaseAdmin.from('usuarios_biblioteca').insert(profilePayload);
      userError = error;
    }

    if (userError) {
      console.error('User update error:', userError);
      await supabaseAdmin.auth.admin.deleteUser(userId).catch((cleanupError) =>
        console.error('Cleanup auth user error (profile step):', cleanupError)
      );
      await releaseTokenReservation(supabaseAdmin, tokenData.id);
      return jsonResponse({ success: false, error: 'Não foi possível criar o perfil do usuário' }, 500);
    }

    // 5. Mark token as used
    const { error: tokenUpdateError } = await supabaseAdmin
      .from('tokens_convite')
      .update({
        usado_por: userId,
        usado_em: new Date().toISOString(),
      })
      .eq('id', tokenData.id)
      .eq('ativo', false)
      .is('usado_por', null);

    if (tokenUpdateError) {
      console.error('Token update error:', tokenUpdateError);
    }

    return jsonResponse({
      success: true,
      message: 'Usuário registrado com sucesso',
      role: tokenData.role_destino,
    });
  } catch (error) {
    console.error('Error processing registration:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return jsonResponse({ success: false, error: errorMessage }, 500);
  }
});
