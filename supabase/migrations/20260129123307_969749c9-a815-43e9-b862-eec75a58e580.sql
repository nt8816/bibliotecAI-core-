-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('gestor', 'professor', 'aluno');

-- Create user_roles table (roles stored separately as required)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'aluno',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create is_gestor helper function
CREATE OR REPLACE FUNCTION public.is_gestor()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'gestor')
$$;

-- User roles policies
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id OR public.is_gestor());

CREATE POLICY "Only gestors can insert roles"
  ON public.user_roles FOR INSERT
  WITH CHECK (public.is_gestor());

CREATE POLICY "Only gestors can update roles"
  ON public.user_roles FOR UPDATE
  USING (public.is_gestor());

CREATE POLICY "Only gestors can delete roles"
  ON public.user_roles FOR DELETE
  USING (public.is_gestor());

-- Create profiles table for library users
CREATE TABLE public.usuarios_biblioteca (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo app_role NOT NULL DEFAULT 'aluno',
  matricula TEXT UNIQUE,
  cpf TEXT,
  turma TEXT,
  telefone TEXT,
  email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on usuarios_biblioteca
ALTER TABLE public.usuarios_biblioteca ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Gestors can view all users"
  ON public.usuarios_biblioteca FOR SELECT
  USING (public.is_gestor());

CREATE POLICY "Users can view their own profile"
  ON public.usuarios_biblioteca FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Gestors can insert users"
  ON public.usuarios_biblioteca FOR INSERT
  WITH CHECK (public.is_gestor() OR auth.uid() = user_id);

CREATE POLICY "Gestors can update all users"
  ON public.usuarios_biblioteca FOR UPDATE
  USING (public.is_gestor() OR auth.uid() = user_id);

CREATE POLICY "Gestors can delete users"
  ON public.usuarios_biblioteca FOR DELETE
  USING (public.is_gestor());

-- Create livros table
CREATE TABLE public.livros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area TEXT NOT NULL DEFAULT '',
  tombo TEXT UNIQUE,
  autor TEXT NOT NULL DEFAULT '',
  titulo TEXT NOT NULL,
  vol TEXT DEFAULT '',
  edicao TEXT DEFAULT '',
  local TEXT DEFAULT '',
  editora TEXT DEFAULT '',
  ano TEXT DEFAULT '',
  disponivel BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on livros
ALTER TABLE public.livros ENABLE ROW LEVEL SECURITY;

-- Livros policies
CREATE POLICY "Everyone can view books"
  ON public.livros FOR SELECT
  USING (true);

CREATE POLICY "Gestors can insert books"
  ON public.livros FOR INSERT
  WITH CHECK (public.is_gestor());

CREATE POLICY "Gestors can update books"
  ON public.livros FOR UPDATE
  USING (public.is_gestor());

CREATE POLICY "Gestors can delete books"
  ON public.livros FOR DELETE
  USING (public.is_gestor());

-- Create emprestimos table
CREATE TABLE public.emprestimos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  livro_id UUID REFERENCES public.livros(id) ON DELETE CASCADE NOT NULL,
  usuario_id UUID REFERENCES public.usuarios_biblioteca(id) ON DELETE CASCADE NOT NULL,
  data_emprestimo TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  data_devolucao_prevista TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '14 days'),
  data_devolucao_real TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'devolvido', 'atrasado')),
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on emprestimos
ALTER TABLE public.emprestimos ENABLE ROW LEVEL SECURITY;

-- Emprestimos policies
CREATE POLICY "Gestors can view all loans"
  ON public.emprestimos FOR SELECT
  USING (public.is_gestor());

CREATE POLICY "Users can view their own loans"
  ON public.emprestimos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios_biblioteca 
      WHERE id = emprestimos.usuario_id 
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Gestors can insert loans"
  ON public.emprestimos FOR INSERT
  WITH CHECK (public.is_gestor());

CREATE POLICY "Gestors can update loans"
  ON public.emprestimos FOR UPDATE
  USING (public.is_gestor());

CREATE POLICY "Gestors can delete loans"
  ON public.emprestimos FOR DELETE
  USING (public.is_gestor());

-- Create function to update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for updated_at
CREATE TRIGGER update_usuarios_biblioteca_updated_at
  BEFORE UPDATE ON public.usuarios_biblioteca
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_livros_updated_at
  BEFORE UPDATE ON public.livros
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_emprestimos_updated_at
  BEFORE UPDATE ON public.emprestimos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.usuarios_biblioteca (user_id, nome, email, tipo)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email), NEW.email, 'aluno');
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'aluno');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();