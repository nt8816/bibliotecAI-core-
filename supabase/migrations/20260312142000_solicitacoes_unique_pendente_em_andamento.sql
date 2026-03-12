DROP INDEX IF EXISTS solicitacoes_emprestimo_pendente_unique;

CREATE UNIQUE INDEX IF NOT EXISTS solicitacoes_emprestimo_pendente_em_andamento_unique
  ON public.solicitacoes_emprestimo (usuario_id, livro_id)
  WHERE status IN ('pendente', 'em_andamento');
