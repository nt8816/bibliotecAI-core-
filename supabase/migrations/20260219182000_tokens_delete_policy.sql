-- Allow gestores to delete invitation tokens permanently

BEGIN;

CREATE POLICY "Gestors can delete tokens" ON public.tokens_convite
  FOR DELETE USING (is_gestor());

COMMIT;
