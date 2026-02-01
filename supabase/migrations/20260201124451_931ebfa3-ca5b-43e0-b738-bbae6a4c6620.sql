-- Função para verificar se é bibliotecária
CREATE OR REPLACE FUNCTION public.is_bibliotecaria()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(auth.uid(), 'bibliotecaria')
$$;

-- Função para verificar se é professor
CREATE OR REPLACE FUNCTION public.is_professor()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(auth.uid(), 'professor')
$$;

-- RLS policies para escolas
CREATE POLICY "Gestors can view their schools" ON public.escolas
  FOR SELECT USING (is_gestor() OR gestor_id = auth.uid());

CREATE POLICY "Gestors can insert schools" ON public.escolas
  FOR INSERT WITH CHECK (is_gestor());

CREATE POLICY "Gestors can update their schools" ON public.escolas
  FOR UPDATE USING (is_gestor() AND gestor_id = auth.uid());

CREATE POLICY "Gestors can delete their schools" ON public.escolas
  FOR DELETE USING (is_gestor() AND gestor_id = auth.uid());

-- RLS policies para salas_cursos
CREATE POLICY "Users can view salas_cursos" ON public.salas_cursos
  FOR SELECT USING (true);

CREATE POLICY "Gestors can insert salas_cursos" ON public.salas_cursos
  FOR INSERT WITH CHECK (is_gestor());

CREATE POLICY "Gestors can update salas_cursos" ON public.salas_cursos
  FOR UPDATE USING (is_gestor());

CREATE POLICY "Gestors can delete salas_cursos" ON public.salas_cursos
  FOR DELETE USING (is_gestor());

-- RLS policies para tokens_convite
CREATE POLICY "Gestors can view all tokens" ON public.tokens_convite
  FOR SELECT USING (is_gestor());

CREATE POLICY "Gestors can insert tokens" ON public.tokens_convite
  FOR INSERT WITH CHECK (is_gestor());

CREATE POLICY "Gestors can update tokens" ON public.tokens_convite
  FOR UPDATE USING (is_gestor());

CREATE POLICY "Anyone can view valid token by token value" ON public.tokens_convite
  FOR SELECT USING (ativo = true AND expira_em > now() AND usado_por IS NULL);

-- RLS policies para sugestoes_livros
CREATE POLICY "Professors can view their suggestions" ON public.sugestoes_livros
  FOR SELECT USING (is_professor() OR is_gestor());

CREATE POLICY "Students can view their received suggestions" ON public.sugestoes_livros
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM usuarios_biblioteca 
      WHERE id = sugestoes_livros.aluno_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Professors can insert suggestions" ON public.sugestoes_livros
  FOR INSERT WITH CHECK (is_professor());

CREATE POLICY "Professors can update their suggestions" ON public.sugestoes_livros
  FOR UPDATE USING (is_professor());

CREATE POLICY "Professors can delete their suggestions" ON public.sugestoes_livros
  FOR DELETE USING (is_professor());

-- RLS policies para atividades_leitura
CREATE POLICY "Professors can view their activities" ON public.atividades_leitura
  FOR SELECT USING (is_professor() OR is_gestor());

CREATE POLICY "Students can view their activities" ON public.atividades_leitura
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM usuarios_biblioteca 
      WHERE id = atividades_leitura.aluno_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Professors can insert activities" ON public.atividades_leitura
  FOR INSERT WITH CHECK (is_professor());

CREATE POLICY "Professors can update their activities" ON public.atividades_leitura
  FOR UPDATE USING (is_professor());

CREATE POLICY "Professors can delete their activities" ON public.atividades_leitura
  FOR DELETE USING (is_professor());

-- Policy para bibliotecária poder adicionar alunos e livros
CREATE POLICY "Bibliotecaria can insert users" ON public.usuarios_biblioteca
  FOR INSERT WITH CHECK (is_bibliotecaria() OR is_gestor() OR (auth.uid() = user_id));

CREATE POLICY "Bibliotecaria can view all users" ON public.usuarios_biblioteca
  FOR SELECT USING (is_bibliotecaria());

CREATE POLICY "Bibliotecaria can insert books" ON public.livros
  FOR INSERT WITH CHECK (is_bibliotecaria());

CREATE POLICY "Bibliotecaria can update books" ON public.livros
  FOR UPDATE USING (is_bibliotecaria());

CREATE POLICY "Bibliotecaria can manage loans" ON public.emprestimos
  FOR ALL USING (is_bibliotecaria());