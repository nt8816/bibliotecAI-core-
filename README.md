# BibliotecAI Core

Sistema web para gestão de biblioteca escolar com perfis de gestor, bibliotecária, professor e aluno.

## Funcionalidades

- Gestão de acervo de livros
- Controle de empréstimos e devoluções
- Gestão de usuários
- Tokens de convite para professores e bibliotecárias
- Relatórios e exportações por módulo
- Painéis específicos por perfil

## Stack

- Node.js
- Vite
- React
- JavaScript
- Tailwind CSS
- Supabase

## Executar localmente

```sh
cd /home/nt/biblioteca-core/bibliotecAI-core-
npm install
npm run dev
```

Aplicação em: `http://localhost:8080`

## Build de produção

```sh
npm run build
npm run preview
```

## Testes

```sh
npm test
```

## Multi-tenant (Schema por Inquilino)

### Pré-requisitos de ambiente

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_APP_BASE_DOMAIN` (ex: `bibliotecai.com.br` ou `bibliotec-ai-core.vercel.app`)

### Banco (Supabase)

1. Rode as migrations para criar:
- `public.tenants`
- `public.tenant_admin_invites`
- função RPC `public.provision_tenant(...)`
- função RPC `public.get_tenant_invite_context(...)`

2. Faça deploy das Edge Functions:
- `registrar-via-convite`
- `registrar-gestor-tenant`

### Wildcard DNS e Vercel

1. Configure wildcard no DNS:
- `*.bibliotecai.com.br` apontando para a Vercel.

2. No projeto Vercel, adicione:
- domínio principal
- wildcard de subdomínio

3. O projeto usa `BrowserRouter` + `vercel.json` com rewrite SPA para suportar rotas:
- `https://admin.seu-dominio/...` (painel global)
- `https://escola-x.seu-dominio/...` (tenant específico)

### Fluxo de provisionamento

1. Acesse `/admin/tenants` com usuário `super_admin`.
2. Crie escola + subdomínio.
3. O sistema gera schema `tenant_*` e link temporário de onboarding.
4. Envie o link para o gestor da escola finalizar o cadastro.
