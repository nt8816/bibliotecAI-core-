-- Impede que bibliotecária (ou usuário comum) crie/atualize usuários do tipo gestor.

DROP POLICY IF EXISTS "Bibliotecaria can insert users" ON public.usuarios_biblioteca;
CREATE POLICY "Bibliotecaria can insert users" ON public.usuarios_biblioteca
  FOR INSERT
  WITH CHECK (
    is_gestor()
    OR (is_bibliotecaria() AND tipo <> 'gestor'::public.app_role)
    OR (auth.uid() = user_id AND tipo <> 'gestor'::public.app_role)
  );

DROP POLICY IF EXISTS "Gestors can update all users" ON public.usuarios_biblioteca;
CREATE POLICY "Gestors can update all users" ON public.usuarios_biblioteca
  FOR UPDATE
  USING (is_gestor() OR is_bibliotecaria() OR auth.uid() = user_id)
  WITH CHECK (
    is_gestor()
    OR ((is_bibliotecaria() OR auth.uid() = user_id) AND tipo <> 'gestor'::public.app_role)
  );
