DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'solicitacoes_emprestimo_mensagens'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.solicitacoes_emprestimo_mensagens;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'reclamacoes_super_admin'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reclamacoes_super_admin;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'system_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.system_logs;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notificacoes_lidas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes_lidas;
  END IF;
END $$;
