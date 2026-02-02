import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { token, nome, email, senha } = await req.json();

    if (!token || !nome || !email || !senha) {
      return new Response(
        JSON.stringify({ success: false, error: 'Dados incompletos' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Create admin client with service role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 1. Verify token is valid
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from('tokens_convite')
      .select('id, role_destino, escola_id, expira_em')
      .eq('token', token)
      .eq('ativo', true)
      .is('usado_por', null)
      .gt('expira_em', new Date().toISOString())
      .maybeSingle();

    if (tokenError || !tokenData) {
      console.error('Token verification error:', tokenError);
      return new Response(
        JSON.stringify({ success: false, error: 'Token inválido ou expirado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // 2. Create user in auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome },
    });

    if (authError) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ success: false, error: authError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const userId = authData.user.id;

    // 3. Update the user_roles record (created by trigger) with correct role
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .update({ role: tokenData.role_destino })
      .eq('user_id', userId);

    if (roleError) {
      console.error('Role update error:', roleError);
    }

    // 4. Update usuarios_biblioteca record with correct tipo and escola_id
    const { error: userError } = await supabaseAdmin
      .from('usuarios_biblioteca')
      .update({ 
        tipo: tokenData.role_destino,
        escola_id: tokenData.escola_id,
        nome: nome,
      })
      .eq('user_id', userId);

    if (userError) {
      console.error('User update error:', userError);
    }

    // 5. Mark token as used
    const { error: tokenUpdateError } = await supabaseAdmin
      .from('tokens_convite')
      .update({
        usado_por: userId,
        usado_em: new Date().toISOString(),
      })
      .eq('id', tokenData.id);

    if (tokenUpdateError) {
      console.error('Token update error:', tokenUpdateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Usuário registrado com sucesso',
        role: tokenData.role_destino,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error processing registration:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
