-- Criar tabela de escolas
CREATE TABLE public.escolas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  gestor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Criar tabela de salas/cursos
CREATE TABLE public.salas_cursos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  escola_id UUID NOT NULL REFERENCES public.escolas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'sala',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de tokens de convite
CREATE TABLE public.tokens_convite (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  escola_id UUID NOT NULL REFERENCES public.escolas(id) ON DELETE CASCADE,
  role_destino public.app_role NOT NULL,
  criado_por UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  usado_em TIMESTAMP WITH TIME ZONE,
  expira_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Adicionar colunas à tabela usuarios_biblioteca
ALTER TABLE public.usuarios_biblioteca 
  ADD COLUMN IF NOT EXISTS escola_id UUID REFERENCES public.escolas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sala_curso_id UUID REFERENCES public.salas_cursos(id) ON DELETE SET NULL;

-- Criar tabela de sugestões de livros (professor -> aluno)
CREATE TABLE public.sugestoes_livros (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  professor_id UUID NOT NULL REFERENCES public.usuarios_biblioteca(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES public.usuarios_biblioteca(id) ON DELETE CASCADE,
  livro_id UUID NOT NULL REFERENCES public.livros(id) ON DELETE CASCADE,
  mensagem TEXT,
  lido BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de atividades de leitura
CREATE TABLE public.atividades_leitura (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  professor_id UUID NOT NULL REFERENCES public.usuarios_biblioteca(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES public.usuarios_biblioteca(id) ON DELETE CASCADE,
  livro_id UUID NOT NULL REFERENCES public.livros(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descricao TEXT,
  pontos_extras DECIMAL(5,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendente',
  data_entrega TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.escolas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salas_cursos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tokens_convite ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sugestoes_livros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atividades_leitura ENABLE ROW LEVEL SECURITY;

-- Triggers para updated_at
CREATE TRIGGER update_escolas_updated_at
  BEFORE UPDATE ON public.escolas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_salas_cursos_updated_at
  BEFORE UPDATE ON public.salas_cursos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_atividades_leitura_updated_at
  BEFORE UPDATE ON public.atividades_leitura
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();