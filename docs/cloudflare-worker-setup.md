# Cloudflare Worker Setup

Worker publicado:

- `https://bibliotecai-api-gateway.bibliotecai.workers.dev`

Arquivo principal do Worker:

- [cloudflare/api-gateway/src/index.ts](/c:/Users/cfake/OneDrive/Documentos/bibliotecAI-core-/cloudflare/api-gateway/src/index.ts)

## Variaveis obrigatorias

No painel do Worker `bibliotecai-api-gateway`, adicione estas variaveis em `Settings` > `Variables`:

- `APP_ENV=production`
- `SUPABASE_URL=https://dhjkjwkitufsvhlhcsec.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY=<publishable key do projeto>`
- `SUPABASE_SERVICE_ROLE_KEY=<service role key do projeto>`
- `SUPABASE_JWT_SECRET=<JWT secret do projeto>`

`SUPABASE_JWT_SECRET` e necessario quando a service role key do Supabase usa `ES256`; o Worker gera um token administrativo `HS256` compativel com as chamadas REST e Auth admin.

## Proximo deploy

Como o Worker criado no painel nasceu como `Hello World`, o codigo atual do projeto ainda precisa ser publicado nele.

Opcoes:

1. Colar o conteudo de [cloudflare/api-gateway/src/index.ts](/c:/Users/cfake/OneDrive/Documentos/bibliotecAI-core-/cloudflare/api-gateway/src/index.ts) em `Edit code` no painel da Cloudflare e publicar.
2. Fazer deploy por `wrangler` usando esta pasta `cloudflare/api-gateway`.

## Rotas prontas

- `GET /health`
- `GET /v1/manifest`
- `GET /v1/reclamacoes`
- `POST /v1/reclamacoes`
- `PATCH /v1/reclamacoes/:id`
- `POST /v1/reclamacoes/:id/read`
- `GET /v1/admin/super-admins`
- `POST /v1/admin/super-admins`
- `POST /v1/admin/super-admins/:id/unlock`

## Frontend

O frontend ja esta apontando para:

- `VITE_PLATFORM_API_BASE_URL="https://bibliotecai-api-gateway.bibliotecai.workers.dev"`

Entao, assim que o Worker receber o codigo real e as variaveis, `Reclamacoes` e `Super Admins` passam a tentar essa camada primeiro, com fallback para Supabase se necessario.
