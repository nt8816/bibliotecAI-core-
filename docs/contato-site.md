# Contatos da landing page

O formulário registra mensagens em `contatos_site`, acessíveis apenas pelo gateway a superadmins autenticados com MFA. O Worker tenta notificar `plataforma.bibliotecai@gmail.com` usando o binding `CONTACT_EMAIL`. O status indica se a Cloudflare aceitou o envio; não comprova entrega na caixa de entrada. Quando o envio falhar, a mensagem continua disponível no painel e não há reenvio automático.

Para ativar em produção:

1. Aplicar a migração `20261112000100_contatos_site.sql` ao projeto Supabase correto.
2. Na Cloudflare, configurar o domínio `bibliotecai.com.br` para envio de email e verificar `plataforma.bibliotecai@gmail.com` como endereço de destino. A verificação exige acesso à caixa de entrada.
3. Publicar o gateway com o binding `CONTACT_EMAIL` configurado no `wrangler.toml` e publicar a aplicação web. Verificar as alterações incluídas antes de publicar.
4. Enviar uma mensagem de teste real e conferir o painel, o status e a caixa de entrada/spam. Verificar os logs do Worker se a notificação falhar.

O limite é de cinco mensagens por IP por hora. O hash do IP fica armazenado com a mensagem; defina uma política de retenção apropriada para os dados de contato.
