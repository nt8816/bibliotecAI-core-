-- Fix RLS policies: Change from RESTRICTIVE to PERMISSIVE
-- The issue is that RESTRICTIVE policies require ALL conditions to be true
-- We need PERMISSIVE policies where ANY matching policy grants access

-- Drop and recreate policies for usuarios_biblioteca
DROP POLICY IF EXISTS "Bibliotecaria can view all users" ON public.usuarios_biblioteca;
DROP POLICY IF EXISTS "Gestors can view all users" ON public.usuarios_biblioteca;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.usuarios_biblioteca;
DROP POLICY IF EXISTS "Bibliotecaria can insert users" ON public.usuarios_biblioteca;
DROP POLICY IF EXISTS "Gestors can insert users" ON public.usuarios_biblioteca;
DROP POLICY IF EXISTS "Gestors can update all users" ON public.usuarios_biblioteca;
DROP POLICY IF EXISTS "Gestors can delete users" ON public.usuarios_biblioteca;

CREATE POLICY "Bibliotecaria can view all users" ON public.usuarios_biblioteca
  FOR SELECT USING (is_bibliotecaria());

CREATE POLICY "Gestors can view all users" ON public.usuarios_biblioteca
  FOR SELECT USING (is_gestor());

CREATE POLICY "Users can view their own profile" ON public.usuarios_biblioteca
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Bibliotecaria can insert users" ON public.usuarios_biblioteca
  FOR INSERT WITH CHECK (is_bibliotecaria() OR is_gestor() OR auth.uid() = user_id);

CREATE POLICY "Gestors can update all users" ON public.usuarios_biblioteca
  FOR UPDATE USING (is_gestor() OR is_bibliotecaria() OR auth.uid() = user_id);

CREATE POLICY "Gestors can delete users" ON public.usuarios_biblioteca
  FOR DELETE USING (is_gestor());

-- Drop and recreate policies for livros
DROP POLICY IF EXISTS "Everyone can view books" ON public.livros;
DROP POLICY IF EXISTS "Bibliotecaria can insert books" ON public.livros;
DROP POLICY IF EXISTS "Bibliotecaria can update books" ON public.livros;
DROP POLICY IF EXISTS "Gestors can insert books" ON public.livros;
DROP POLICY IF EXISTS "Gestors can update books" ON public.livros;
DROP POLICY IF EXISTS "Gestors can delete books" ON public.livros;

CREATE POLICY "Everyone can view books" ON public.livros
  FOR SELECT USING (true);

CREATE POLICY "Bibliotecaria can insert books" ON public.livros
  FOR INSERT WITH CHECK (is_bibliotecaria() OR is_gestor());

CREATE POLICY "Bibliotecaria can update books" ON public.livros
  FOR UPDATE USING (is_bibliotecaria() OR is_gestor());

CREATE POLICY "Bibliotecaria can delete books" ON public.livros
  FOR DELETE USING (is_bibliotecaria() OR is_gestor());

-- Drop and recreate policies for emprestimos
DROP POLICY IF EXISTS "Bibliotecaria can manage loans" ON public.emprestimos;
DROP POLICY IF EXISTS "Gestors can view all loans" ON public.emprestimos;
DROP POLICY IF EXISTS "Gestors can insert loans" ON public.emprestimos;
DROP POLICY IF EXISTS "Gestors can update loans" ON public.emprestimos;
DROP POLICY IF EXISTS "Gestors can delete loans" ON public.emprestimos;
DROP POLICY IF EXISTS "Users can view their own loans" ON public.emprestimos;

CREATE POLICY "Bibliotecaria can manage loans" ON public.emprestimos
  FOR ALL USING (is_bibliotecaria() OR is_gestor());

CREATE POLICY "Users can view their own loans" ON public.emprestimos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM usuarios_biblioteca
      WHERE usuarios_biblioteca.id = emprestimos.usuario_id
      AND usuarios_biblioteca.user_id = auth.uid()
    )
  );

-- Drop and recreate policies for atividades_leitura
DROP POLICY IF EXISTS "Professors can view their activities" ON public.atividades_leitura;
DROP POLICY IF EXISTS "Professors can insert activities" ON public.atividades_leitura;
DROP POLICY IF EXISTS "Professors can update their activities" ON public.atividades_leitura;
DROP POLICY IF EXISTS "Professors can delete their activities" ON public.atividades_leitura;
DROP POLICY IF EXISTS "Students can view their activities" ON public.atividades_leitura;

CREATE POLICY "Professors can view their activities" ON public.atividades_leitura
  FOR SELECT USING (is_professor() OR is_gestor());

CREATE POLICY "Professors can insert activities" ON public.atividades_leitura
  FOR INSERT WITH CHECK (is_professor() OR is_gestor());

CREATE POLICY "Professors can update their activities" ON public.atividades_leitura
  FOR UPDATE USING (is_professor() OR is_gestor());

CREATE POLICY "Professors can delete their activities" ON public.atividades_leitura
  FOR DELETE USING (is_professor() OR is_gestor());

CREATE POLICY "Students can view their activities" ON public.atividades_leitura
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM usuarios_biblioteca
      WHERE usuarios_biblioteca.id = atividades_leitura.aluno_id
      AND usuarios_biblioteca.user_id = auth.uid()
    )
  );

-- Drop and recreate policies for sugestoes_livros
DROP POLICY IF EXISTS "Professors can view their suggestions" ON public.sugestoes_livros;
DROP POLICY IF EXISTS "Professors can insert suggestions" ON public.sugestoes_livros;
DROP POLICY IF EXISTS "Professors can update their suggestions" ON public.sugestoes_livros;
DROP POLICY IF EXISTS "Professors can delete their suggestions" ON public.sugestoes_livros;
DROP POLICY IF EXISTS "Students can view their received suggestions" ON public.sugestoes_livros;

CREATE POLICY "Professors can view their suggestions" ON public.sugestoes_livros
  FOR SELECT USING (is_professor() OR is_gestor());

CREATE POLICY "Professors can insert suggestions" ON public.sugestoes_livros
  FOR INSERT WITH CHECK (is_professor() OR is_gestor());

CREATE POLICY "Professors can update their suggestions" ON public.sugestoes_livros
  FOR UPDATE USING (is_professor() OR is_gestor());

CREATE POLICY "Professors can delete their suggestions" ON public.sugestoes_livros
  FOR DELETE USING (is_professor() OR is_gestor());

CREATE POLICY "Students can view their received suggestions" ON public.sugestoes_livros
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM usuarios_biblioteca
      WHERE usuarios_biblioteca.id = sugestoes_livros.aluno_id
      AND usuarios_biblioteca.user_id = auth.uid()
    )
  );

-- Drop and recreate policies for escolas
DROP POLICY IF EXISTS "Gestors can view their schools" ON public.escolas;
DROP POLICY IF EXISTS "Gestors can insert schools" ON public.escolas;
DROP POLICY IF EXISTS "Gestors can update their schools" ON public.escolas;
DROP POLICY IF EXISTS "Gestors can delete their schools" ON public.escolas;

CREATE POLICY "Gestors can view their schools" ON public.escolas
  FOR SELECT USING (is_gestor() OR gestor_id = auth.uid());

CREATE POLICY "Gestors can insert schools" ON public.escolas
  FOR INSERT WITH CHECK (is_gestor());

CREATE POLICY "Gestors can update their schools" ON public.escolas
  FOR UPDATE USING (is_gestor() AND gestor_id = auth.uid());

CREATE POLICY "Gestors can delete their schools" ON public.escolas
  FOR DELETE USING (is_gestor() AND gestor_id = auth.uid());

-- Allow bibliotecaria and professors to view escolas they belong to
CREATE POLICY "Staff can view their school" ON public.escolas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM usuarios_biblioteca
      WHERE usuarios_biblioteca.escola_id = escolas.id
      AND usuarios_biblioteca.user_id = auth.uid()
    )
  );

-- Drop and recreate policies for salas_cursos
DROP POLICY IF EXISTS "Users can view salas_cursos" ON public.salas_cursos;
DROP POLICY IF EXISTS "Gestors can insert salas_cursos" ON public.salas_cursos;
DROP POLICY IF EXISTS "Gestors can update salas_cursos" ON public.salas_cursos;
DROP POLICY IF EXISTS "Gestors can delete salas_cursos" ON public.salas_cursos;

CREATE POLICY "Users can view salas_cursos" ON public.salas_cursos
  FOR SELECT USING (true);

CREATE POLICY "Gestors can insert salas_cursos" ON public.salas_cursos
  FOR INSERT WITH CHECK (is_gestor());

CREATE POLICY "Gestors can update salas_cursos" ON public.salas_cursos
  FOR UPDATE USING (is_gestor());

CREATE POLICY "Gestors can delete salas_cursos" ON public.salas_cursos
  FOR DELETE USING (is_gestor());

-- Drop and recreate policies for tokens_convite
DROP POLICY IF EXISTS "Gestors can view all tokens" ON public.tokens_convite;
DROP POLICY IF EXISTS "Gestors can insert tokens" ON public.tokens_convite;
DROP POLICY IF EXISTS "Gestors can update tokens" ON public.tokens_convite;
DROP POLICY IF EXISTS "Anyone can view valid token by token value" ON public.tokens_convite;

CREATE POLICY "Gestors can view all tokens" ON public.tokens_convite
  FOR SELECT USING (is_gestor());

CREATE POLICY "Gestors can insert tokens" ON public.tokens_convite
  FOR INSERT WITH CHECK (is_gestor());

CREATE POLICY "Gestors can update tokens" ON public.tokens_convite
  FOR UPDATE USING (is_gestor());

CREATE POLICY "Anyone can view valid token by token value" ON public.tokens_convite
  FOR SELECT USING (ativo = true AND expira_em > now() AND usado_por IS NULL);

-- Drop and recreate policies for user_roles
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Only gestors can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Only gestors can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Only gestors can delete roles" ON public.user_roles;

CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id OR is_gestor());

CREATE POLICY "Only gestors can insert roles" ON public.user_roles
  FOR INSERT WITH CHECK (is_gestor());

CREATE POLICY "Only gestors can update roles" ON public.user_roles
  FOR UPDATE USING (is_gestor());

CREATE POLICY "Only gestors can delete roles" ON public.user_roles
  FOR DELETE USING (is_gestor());