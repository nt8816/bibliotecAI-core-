

# BibliotecAI - Sistema Completo de Gestão de Biblioteca

Vou recriar o sistema BibliotecAI no Lovable, mantendo o **design original** com a paleta de cores verde (#2e7d32, #43a047), tipografia Nunito e a estrutura visual com sidebar. O backend será implementado usando **Supabase** (banco de dados PostgreSQL + autenticação).

---

## 🎨 Design & Interface

- **Tema visual**: Verde institucional com fundo claro (#f8f9fa)
- **Sidebar fixa** à esquerda com navegação (Dashboard, Livros, Usuários, Empréstimos, Relatórios, Sair)
- **Cards com sombra** e animações de hover sutis
- **Responsivo**: Sidebar colapsa em telas menores

---

## 🔐 1. Autenticação

- **Página de Login** com dois perfis: Aluno e Gestão
- Login com email/matrícula e senha
- Usuário admin padrão criado automaticamente
- Redirecionamento automático após login

---

## 📊 2. Dashboard (Painel do Gestor)

- 4 cards com estatísticas em tempo real:
  - Total de Livros
  - Total de Usuários
  - Leituras Ativas (empréstimos)
  - Alertas (atrasos)
- Seção de **Atividades Recentes**
- Dados carregados do banco

---

## 📚 3. Gerenciamento de Livros

- **Tabela** com todos os livros cadastrados
- **Campos**: Área, Tombo, Autor, Título, Volume, Edição, Local, Editora, Ano
- **Ações**: Adicionar, Editar, Excluir
- **Modal** para cadastro/edição
- Indicador de disponibilidade

---

## 👥 4. Gerenciamento de Usuários

- **Tabela** com usuários (Alunos, Professores, Gestores)
- **Campos**: Nome, Tipo, Matrícula, CPF, Turma, Telefone, Email
- **Ações**: Adicionar, Editar, Excluir
- Senha padrão para novos usuários

---

## 📖 5. Gerenciamento de Empréstimos

- **Lista** de empréstimos ativos e histórico
- Informações do livro e usuário vinculados
- **Criar empréstimo**: Selecionar livro + usuário
- Prazo padrão de 14 dias
- **Devolver livro** (atualiza status e disponibilidade)
- Destaque para **empréstimos atrasados**

---

## 📈 6. Relatórios

- Estatísticas gerais da biblioteca
- Gráficos de empréstimos por período
- Livros mais emprestados
- Usuários mais ativos

---

## 🗄️ Banco de Dados (Supabase)

Três tabelas principais:
- **livros**: área, tombo, autor, titulo, vol, edicao, local, editora, ano, disponivel
- **usuarios_biblioteca**: nome, tipo, matricula, cpf, turma, telefone, email (vinculado ao auth.users)
- **emprestimos**: livro_id, usuario_id, data_emprestimo, data_devolucao_prevista, data_devolucao_real, status, observacoes

Políticas de segurança (RLS) configuradas para proteger os dados.

