-- School managers cannot grant, modify, or remove global administrator roles.
DROP POLICY IF EXISTS "Gestors can insert roles in own school" ON public.user_roles;
CREATE POLICY "Gestors can insert roles in own school" ON public.user_roles FOR INSERT
  WITH CHECK (public.is_super_admin() OR (role <> 'super_admin' AND public.is_gestor() AND public.is_same_user_escola(user_id)));
DROP POLICY IF EXISTS "Gestors can update roles in own school" ON public.user_roles;
CREATE POLICY "Gestors can update roles in own school" ON public.user_roles FOR UPDATE
  USING (public.is_super_admin() OR (role <> 'super_admin' AND public.is_gestor() AND public.is_same_user_escola(user_id)))
  WITH CHECK (public.is_super_admin() OR (role <> 'super_admin' AND public.is_gestor() AND public.is_same_user_escola(user_id)));
DROP POLICY IF EXISTS "Gestors can delete roles in own school" ON public.user_roles;
CREATE POLICY "Gestors can delete roles in own school" ON public.user_roles FOR DELETE
  USING (public.is_super_admin() OR (role <> 'super_admin' AND public.is_gestor() AND public.is_same_user_escola(user_id)));

DROP POLICY IF EXISTS "Users can insert their own loan request messages" ON public.solicitacoes_emprestimo_mensagens;
DROP POLICY IF EXISTS "Staff can view all loan request messages" ON public.solicitacoes_emprestimo_mensagens;
DROP POLICY IF EXISTS "Staff can insert loan request messages" ON public.solicitacoes_emprestimo_mensagens;
CREATE POLICY "Staff can view school loan request messages" ON public.solicitacoes_emprestimo_mensagens FOR SELECT
  USING ((public.is_bibliotecaria() OR public.is_gestor()) AND EXISTS (
    SELECT 1 FROM public.solicitacoes_emprestimo se
    JOIN public.usuarios_biblioteca student ON student.id = se.usuario_id
    WHERE se.id = solicitacao_id AND student.escola_id = public.get_user_escola_id(auth.uid())
  ));
CREATE POLICY "Users can insert authorized loan request messages" ON public.solicitacoes_emprestimo_mensagens FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.solicitacoes_emprestimo se
    JOIN public.usuarios_biblioteca student ON student.id = se.usuario_id
    JOIN public.usuarios_biblioteca author ON author.id = autor_usuario_id
    WHERE se.id = solicitacao_id AND author.user_id = auth.uid()
      AND author.tipo::text = autor_tipo
      AND (student.user_id = auth.uid() OR (
        (public.is_bibliotecaria() OR public.is_gestor())
        AND student.escola_id = public.get_user_escola_id(auth.uid())
        AND author.escola_id = student.escola_id
      ))
  ));
