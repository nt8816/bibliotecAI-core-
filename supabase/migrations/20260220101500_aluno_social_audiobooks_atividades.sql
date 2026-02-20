-- Recursos para painel do aluno: rede social, audiobooks e entregas de atividades com pontos

-- Entregas das atividades de leitura (aluno realiza, professor avalia)
CREATE TABLE IF NOT EXISTS public.atividades_entregas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atividade_id UUID NOT NULL REFERENCES public.atividades_leitura(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES public.usuarios_biblioteca(id) ON DELETE CASCADE,
  texto_entrega TEXT NOT NULL,
  anexo_url TEXT,
  status TEXT NOT NULL DEFAULT 'enviada',
  pontos_ganhos DECIMAL(5,2) NOT NULL DEFAULT 0,
  feedback_professor TEXT,
  enviado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  avaliado_em TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT atividades_entregas_status_check CHECK (status IN ('enviada', 'em_revisao', 'aprovada', 'revisar')),
  CONSTRAINT atividades_entregas_unique UNIQUE (atividade_id, aluno_id)
);

ALTER TABLE public.atividades_entregas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students and staff can view submissions" ON public.atividades_entregas
  FOR SELECT USING (
    is_professor() OR is_gestor() OR is_bibliotecaria() OR EXISTS (
      SELECT 1 FROM public.usuarios_biblioteca
      WHERE usuarios_biblioteca.id = atividades_entregas.aluno_id
      AND usuarios_biblioteca.user_id = auth.uid()
    )
  );

CREATE POLICY "Students can insert their own submission" ON public.atividades_entregas
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios_biblioteca
      WHERE usuarios_biblioteca.id = atividades_entregas.aluno_id
      AND usuarios_biblioteca.user_id = auth.uid()
    )
  );

CREATE POLICY "Students and staff can update submission" ON public.atividades_entregas
  FOR UPDATE USING (
    is_professor() OR is_gestor() OR EXISTS (
      SELECT 1 FROM public.usuarios_biblioteca
      WHERE usuarios_biblioteca.id = atividades_entregas.aluno_id
      AND usuarios_biblioteca.user_id = auth.uid()
    )
  );

CREATE POLICY "Students and staff can delete submission" ON public.atividades_entregas
  FOR DELETE USING (
    is_professor() OR is_gestor() OR EXISTS (
      SELECT 1 FROM public.usuarios_biblioteca
      WHERE usuarios_biblioteca.id = atividades_entregas.aluno_id
      AND usuarios_biblioteca.user_id = auth.uid()
    )
  );

-- Comunidade (mini rede social)
CREATE TABLE IF NOT EXISTS public.comunidade_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  autor_id UUID NOT NULL REFERENCES public.usuarios_biblioteca(id) ON DELETE CASCADE,
  livro_id UUID REFERENCES public.livros(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL DEFAULT 'resenha',
  titulo TEXT,
  conteudo TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT comunidade_posts_tipo_check CHECK (tipo IN ('resenha', 'sugestao', 'dica'))
);

CREATE TABLE IF NOT EXISTS public.comunidade_curtidas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.comunidade_posts(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES public.usuarios_biblioteca(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT comunidade_curtidas_unique UNIQUE (post_id, usuario_id)
);

ALTER TABLE public.comunidade_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunidade_curtidas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view community posts" ON public.comunidade_posts
  FOR SELECT USING (true);

CREATE POLICY "Users can create own community posts" ON public.comunidade_posts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios_biblioteca
      WHERE usuarios_biblioteca.id = comunidade_posts.autor_id
      AND usuarios_biblioteca.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own community posts" ON public.comunidade_posts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.usuarios_biblioteca
      WHERE usuarios_biblioteca.id = comunidade_posts.autor_id
      AND usuarios_biblioteca.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own community posts" ON public.comunidade_posts
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.usuarios_biblioteca
      WHERE usuarios_biblioteca.id = comunidade_posts.autor_id
      AND usuarios_biblioteca.user_id = auth.uid()
    )
  );

CREATE POLICY "Everyone can view likes" ON public.comunidade_curtidas
  FOR SELECT USING (true);

CREATE POLICY "Users can like with own profile" ON public.comunidade_curtidas
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios_biblioteca
      WHERE usuarios_biblioteca.id = comunidade_curtidas.usuario_id
      AND usuarios_biblioteca.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can remove own likes" ON public.comunidade_curtidas
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.usuarios_biblioteca
      WHERE usuarios_biblioteca.id = comunidade_curtidas.usuario_id
      AND usuarios_biblioteca.user_id = auth.uid()
    )
  );

-- Audiobooks
CREATE TABLE IF NOT EXISTS public.audiobooks_biblioteca (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  livro_id UUID NOT NULL REFERENCES public.livros(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  autor TEXT,
  duracao_minutos INTEGER,
  audio_url TEXT NOT NULL,
  criado_por UUID REFERENCES public.usuarios_biblioteca(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.aluno_audiobooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID NOT NULL REFERENCES public.usuarios_biblioteca(id) ON DELETE CASCADE,
  audiobook_id UUID NOT NULL REFERENCES public.audiobooks_biblioteca(id) ON DELETE CASCADE,
  progresso_segundos INTEGER NOT NULL DEFAULT 0,
  favorito BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT aluno_audiobooks_unique UNIQUE (aluno_id, audiobook_id)
);

ALTER TABLE public.audiobooks_biblioteca ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aluno_audiobooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view audiobooks" ON public.audiobooks_biblioteca
  FOR SELECT USING (true);

CREATE POLICY "Users can create audiobooks" ON public.audiobooks_biblioteca
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios_biblioteca
      WHERE usuarios_biblioteca.id = audiobooks_biblioteca.criado_por
      AND usuarios_biblioteca.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff or creator can update audiobooks" ON public.audiobooks_biblioteca
  FOR UPDATE USING (
    is_professor() OR is_gestor() OR is_bibliotecaria() OR EXISTS (
      SELECT 1 FROM public.usuarios_biblioteca
      WHERE usuarios_biblioteca.id = audiobooks_biblioteca.criado_por
      AND usuarios_biblioteca.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff or creator can delete audiobooks" ON public.audiobooks_biblioteca
  FOR DELETE USING (
    is_professor() OR is_gestor() OR is_bibliotecaria() OR EXISTS (
      SELECT 1 FROM public.usuarios_biblioteca
      WHERE usuarios_biblioteca.id = audiobooks_biblioteca.criado_por
      AND usuarios_biblioteca.user_id = auth.uid()
    )
  );

CREATE POLICY "Students can view own audiobook list" ON public.aluno_audiobooks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.usuarios_biblioteca
      WHERE usuarios_biblioteca.id = aluno_audiobooks.aluno_id
      AND usuarios_biblioteca.user_id = auth.uid()
    )
  );

CREATE POLICY "Students can add own audiobooks" ON public.aluno_audiobooks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios_biblioteca
      WHERE usuarios_biblioteca.id = aluno_audiobooks.aluno_id
      AND usuarios_biblioteca.user_id = auth.uid()
    )
  );

CREATE POLICY "Students can update own audiobooks" ON public.aluno_audiobooks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.usuarios_biblioteca
      WHERE usuarios_biblioteca.id = aluno_audiobooks.aluno_id
      AND usuarios_biblioteca.user_id = auth.uid()
    )
  );

CREATE POLICY "Students can delete own audiobooks" ON public.aluno_audiobooks
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.usuarios_biblioteca
      WHERE usuarios_biblioteca.id = aluno_audiobooks.aluno_id
      AND usuarios_biblioteca.user_id = auth.uid()
    )
  );

-- Triggers updated_at
DROP TRIGGER IF EXISTS update_atividades_entregas_updated_at ON public.atividades_entregas;
CREATE TRIGGER update_atividades_entregas_updated_at
  BEFORE UPDATE ON public.atividades_entregas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_comunidade_posts_updated_at ON public.comunidade_posts;
CREATE TRIGGER update_comunidade_posts_updated_at
  BEFORE UPDATE ON public.comunidade_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_audiobooks_biblioteca_updated_at ON public.audiobooks_biblioteca;
CREATE TRIGGER update_audiobooks_biblioteca_updated_at
  BEFORE UPDATE ON public.audiobooks_biblioteca
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_aluno_audiobooks_updated_at ON public.aluno_audiobooks;
CREATE TRIGGER update_aluno_audiobooks_updated_at
  BEFORE UPDATE ON public.aluno_audiobooks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.atividades_entregas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comunidade_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comunidade_curtidas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.audiobooks_biblioteca;
ALTER PUBLICATION supabase_realtime ADD TABLE public.aluno_audiobooks;
