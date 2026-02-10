
-- Tabela de avaliações de livros (estrelas + resenha)
CREATE TABLE public.avaliacoes_livros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  livro_id uuid NOT NULL REFERENCES public.livros(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES public.usuarios_biblioteca(id) ON DELETE CASCADE,
  nota integer NOT NULL CHECK (nota >= 1 AND nota <= 5),
  resenha text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(livro_id, usuario_id)
);

ALTER TABLE public.avaliacoes_livros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view reviews" ON public.avaliacoes_livros FOR SELECT USING (true);
CREATE POLICY "Users can insert their own reviews" ON public.avaliacoes_livros FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.usuarios_biblioteca WHERE id = avaliacoes_livros.usuario_id AND user_id = auth.uid()));
CREATE POLICY "Users can update their own reviews" ON public.avaliacoes_livros FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.usuarios_biblioteca WHERE id = avaliacoes_livros.usuario_id AND user_id = auth.uid()));
CREATE POLICY "Users can delete their own reviews" ON public.avaliacoes_livros FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.usuarios_biblioteca WHERE id = avaliacoes_livros.usuario_id AND user_id = auth.uid()));

-- Tabela de lista de desejos
CREATE TABLE public.lista_desejos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  livro_id uuid NOT NULL REFERENCES public.livros(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES public.usuarios_biblioteca(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(livro_id, usuario_id)
);

ALTER TABLE public.lista_desejos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own wishlist" ON public.lista_desejos FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.usuarios_biblioteca WHERE id = lista_desejos.usuario_id AND user_id = auth.uid()));
CREATE POLICY "Users can insert into their wishlist" ON public.lista_desejos FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.usuarios_biblioteca WHERE id = lista_desejos.usuario_id AND user_id = auth.uid()));
CREATE POLICY "Users can delete from their wishlist" ON public.lista_desejos FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.usuarios_biblioteca WHERE id = lista_desejos.usuario_id AND user_id = auth.uid()));

-- Tabela de preferências do aluno (questionário)
CREATE TABLE public.preferencias_aluno (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios_biblioteca(id) ON DELETE CASCADE UNIQUE,
  generos_favoritos text[] DEFAULT '{}',
  autores_favoritos text[] DEFAULT '{}',
  ultimos_livros text[] DEFAULT '{}',
  nivel_leitura text DEFAULT 'intermediario',
  frequencia_leitura text DEFAULT 'semanal',
  idiomas text[] DEFAULT '{português}',
  formatos_preferidos text[] DEFAULT '{físico}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.preferencias_aluno ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own preferences" ON public.preferencias_aluno FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.usuarios_biblioteca WHERE id = preferencias_aluno.usuario_id AND user_id = auth.uid()));
CREATE POLICY "Users can insert their own preferences" ON public.preferencias_aluno FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.usuarios_biblioteca WHERE id = preferencias_aluno.usuario_id AND user_id = auth.uid()));
CREATE POLICY "Users can update their own preferences" ON public.preferencias_aluno FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.usuarios_biblioteca WHERE id = preferencias_aluno.usuario_id AND user_id = auth.uid()));
CREATE POLICY "Professors and staff can view preferences" ON public.preferencias_aluno FOR SELECT
  USING (is_professor() OR is_bibliotecaria() OR is_gestor());

-- Tabela de solicitações de empréstimo (aluno pede)
CREATE TABLE public.solicitacoes_emprestimo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  livro_id uuid NOT NULL REFERENCES public.livros(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES public.usuarios_biblioteca(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pendente',
  mensagem text,
  resposta text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.solicitacoes_emprestimo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own requests" ON public.solicitacoes_emprestimo FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.usuarios_biblioteca WHERE id = solicitacoes_emprestimo.usuario_id AND user_id = auth.uid()));
CREATE POLICY "Users can create requests" ON public.solicitacoes_emprestimo FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.usuarios_biblioteca WHERE id = solicitacoes_emprestimo.usuario_id AND user_id = auth.uid()));
CREATE POLICY "Staff can view all requests" ON public.solicitacoes_emprestimo FOR SELECT
  USING (is_bibliotecaria() OR is_gestor());
CREATE POLICY "Staff can update requests" ON public.solicitacoes_emprestimo FOR UPDATE
  USING (is_bibliotecaria() OR is_gestor());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.avaliacoes_livros;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lista_desejos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.solicitacoes_emprestimo;

-- Trigger para updated_at
CREATE TRIGGER update_avaliacoes_livros_updated_at BEFORE UPDATE ON public.avaliacoes_livros FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_preferencias_aluno_updated_at BEFORE UPDATE ON public.preferencias_aluno FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_solicitacoes_emprestimo_updated_at BEFORE UPDATE ON public.solicitacoes_emprestimo FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
