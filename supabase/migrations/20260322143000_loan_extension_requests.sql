BEGIN;

ALTER TABLE public.solicitacoes_emprestimo
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'emprestimo',
  ADD COLUMN IF NOT EXISTS emprestimo_id uuid REFERENCES public.emprestimos(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS data_devolucao_atual timestamptz,
  ADD COLUMN IF NOT EXISTS nova_data_devolucao_solicitada timestamptz,
  ADD COLUMN IF NOT EXISTS respondido_em timestamptz;

UPDATE public.solicitacoes_emprestimo
SET tipo = 'emprestimo'
WHERE tipo IS NULL OR trim(tipo) = '';

ALTER TABLE public.solicitacoes_emprestimo
  DROP CONSTRAINT IF EXISTS solicitacoes_emprestimo_tipo_check;

ALTER TABLE public.solicitacoes_emprestimo
  ADD CONSTRAINT solicitacoes_emprestimo_tipo_check
  CHECK (tipo IN ('emprestimo', 'prorrogacao'));

DROP INDEX IF EXISTS solicitacoes_emprestimo_pendente_unique;
DROP INDEX IF EXISTS solicitacoes_emprestimo_pendente_em_andamento_unique;

CREATE UNIQUE INDEX IF NOT EXISTS solicitacoes_emprestimo_pending_unique
  ON public.solicitacoes_emprestimo (
    usuario_id,
    livro_id,
    tipo,
    COALESCE(emprestimo_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE status IN ('pendente', 'em_andamento');

COMMIT;
