## Migracao para Cloudflare R2

Esta base agora tem a infraestrutura inicial para usar Cloudflare R2 com URLs assinadas.

### Variaveis da edge function `r2-storage`

Configure estes secrets no projeto Supabase:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_PUBLIC_BASE_URL` opcional

### O que ja foi migrado

- `ArquivosAula.jsx`
  - upload direto para Cloudflare R2
  - download por URL assinada
  - exclusao no R2
  - compatibilidade com arquivos antigos do bucket `arquivos-aula` no Supabase Storage

### Estrategia adotada

- o frontend nunca recebe as credenciais do R2
- a edge function gera URLs temporarias de upload/download
- cada objeto fica sob o prefixo:

`escolas/<escola_id>/<escopo>/<owner_id>/<timestamp>-<arquivo>`

### Proximas migracoes recomendadas

- `Reclamacoes.jsx`
  hoje ainda grava `image_urls` no banco
- `PainelAluno.jsx`
  imagens de laboratorio e comunidade ainda usam data URL/base64
- `audiobooks_biblioteca.audio_url`
  audios ainda ficam no banco

### Deploy sugerido

1. Publicar a edge function `r2-storage`
2. Configurar os secrets acima
3. Validar upload e download em `Arquivos de Aula`
4. Migrar os anexos antigos do Supabase Storage para o R2 quando desejar
