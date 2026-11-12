# Plano: recomendação de livros

**Objetivo:** sugerir livros personalizados nas áreas do aluno e da equipe, com primeira escolha por IA e até três trocas diárias por classificação local.

**Arquitetura:** o gateway autentica o usuário, consulta apenas seu histórico e o acervo autorizado e mantém preferências e estado diário no Supabase. A seleção local determina os candidatos e a IA escolhe entre eles, sem receber dados pessoais identificáveis; respostas inválidas usam a classificação local.

## Etapas

1. Implementar e testar classificação determinística por áreas, autores e histórico, com exclusão de empréstimos ativos e verificação de disponibilidade. Cobertura: S1, S2, S5.
2. Criar migração com preferências e estado diário individual, incluindo IDs já apresentados, sugestão principal em cache e operação atômica que limita as trocas a três por dia no fuso America/Sao_Paulo. Restringir acesso ao serviço e derivar identidade do token validado. Cobertura: S2, S4, S5.
3. Adicionar rotas autenticadas ao gateway para consulta, atualização de gostos e próxima sugestão; validar escola e usuário, candidatos e resposta da IA, com fallback local e sem expor histórico de outras pessoas. Testar concorrência e isolamento. Cobertura: S1, S2, S4, S5.
4. Criar componente compartilhado e serviço para exibir sugestão, motivo, gostos e contador; integrá-los à biblioteca do aluno e ao catálogo da equipe preservando o fluxo existente de empréstimo. Testar estados vazio, erro e limite. Cobertura: S1, S3, S4, S5.
5. Executar testes específicos, lint, verificação de tipos do gateway e build. Registrar falhas existentes separadamente. Não aplicar migração nem publicar em produção sem autorização específica. Cobertura: S5, S6.

## Observações

- O catálogo atual pode incluir livros legados sem escola; verificar as regras existentes antes de selecionar candidatos.
- Há alterações anteriores no gateway e em arquivos de interface: preservá-las e verificar seus diffs antes de editar.
- Não usar histórico global de empréstimos como se fosse histórico pessoal; o gateway usa credenciais administrativas e deve impor os filtros explicitamente.
