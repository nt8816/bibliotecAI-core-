# [S1] Problem
Laboratório do aluno é visualmente denso/confuso. Notificações mobile usam Popover (não ideal para toque).

## [S2] Solution overview
- Laboratório: layout profissional com header compacto, tools (Resumo, Quiz, Studio) e grade de criações.
- Notificações: no mobile, bottom sheet sobe de baixo até ~55% da tela; desktop mantém popover.

## [S3] Laboratório UX
- Header compacto: "Laboratório" + contagem de criações
- Tool cards: Resumo com IA, Quiz com IA, Studio (atajos)
- Filtros de tipo + grid de criações (imagem/tipo/data)
- Backend/estado do PainelAluno preservados

## [S4] Notificações mobile
- Bell abre Sheet inferior no mobile (`max-h ~55vh`, arrasto/click fora fecha)
- Conteúdo igual ao popover atual
- Desktop: popover inalterado

## [S5] Infra
- Componentes novos em `src/components/community/` e `src/components/layout/`
- Sem API nova

## [S6] Testing
- Build + testes existentes
- Deploy Pages
