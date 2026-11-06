# [S1] Problem
Comunicados e Arquivos Didáticos do BibliotecAI estão visualmente densos e confusos (cards de dashboard, composer longo, mídia sem hierarquia). Público: alunos leem; professores/gestão publicam. Precisam de UI inspirada em WhatsApp/Instagram, funcional, sem quebrar API/R2 atual.

## [S2] Solution overview
Redesign de UI (sem nova API):
- **Comunicados** = feed vertical de avisos (autor, turma, mídia, anexos, áudio) + composer em sheet/modal só para quem publica.
- **Arquivos Didáticos** = lista estilo “envelope de material” (chip turma, anexos com ícone/tamanho/download), composer compacto para envio.
- Componentes compartilhados em `src/components/community/`.

## [S3] UX Comunicados
- Header compacto: título + contagem + chip “Canal oficial”.
- Feed scrollável de posts (`ComunicadoFeedCard`): avatar/autor, data relativa, turma badge, texto, galeria de imagens, player de áudio, chips de anexo PDF/Office, ações (apagar se autor/gestão).
- FAB “Novo comunicado” apenas para `canPublish` (professor/gestor/bibliotecária).
- Composer: sheet/modal com título, corpo, turma, imagens (até 4), áudio, arquivos (até 6), data de expiração opcional.
- Aluno: só leitura + download; sem FAB.

## [S4] UX Arquivos Didáticos
- Header: título + contagem + botão enviar (gestão).
- Feed de posts (`MaterialFeedCard`): autor, turma, data, lista de anexos com extensão, tamanho, download, preview imagem se houver.
- Composer: destinatário turma + input de arquivos + descrição curta.
- Professor/gestão: envio; aluno: download.

## [S5] Componentes
- `ChannelTopBar` — título, meta, ação principal.
- `FeedCardShell` — card de post com header/mídia/footer.
- `ComposerSheet` — modal/sheet de criação.
- `AttachmentList` / `ImageGrid` / `AudioPlayer` wrappers.
- Reutilizar `MainLayout`, `Card`/`Button`/`Dialog`/`Badge` e `AudioMessagePlayer` existentes.

## [S6] Infra
- **Nenhuma mudança de API obrigatória.** Manter endpoints atuais:
  - Comunicados: `comunidade_posts` tipo `comunicado` via `comunidadeAlunoService`.
  - Arquivos: `fetchArquivosAulaData` / create / delete + R2.
- Validações de permissão e upload R2 permanecem.

## [S7] Visual
- Paleta institucional já do app (verde emerald/slate, dark mode).
- Bolhas/cards com radius 20–24, sombras suaves, chips de turma, texto legível (contraste alto).
- Espaçamento generoso; hierarchy: autor > texto > mídia > anexos.
- Mobile-first (toque grande para download/FAB).

## [S8] Error handling / loading
- Skeletons no feed.
- Toasts já existentes em fluxos de erro.
- Composer desabilita submit durante upload.

## [S9] Testing
- Testes unitários de helpers (filtros de turma, formatação de anexo) se extraídos.
- Verificação manual: aluno lê; gestor publica comunicado com mídia; professor envia arquivo e aluno baixa.
- `npm test` e build web verdes.

## [S10] Out of scope
- Stories 24h, canais multi-tenant novos, backend de pastas, chat em tempo real.
