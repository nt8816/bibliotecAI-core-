import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import PainelAluno from '@/pages/aluno/PainelAluno.jsx';

const tableData = {
  usuarios_biblioteca: [{ id: 'aluno-1', escola_id: 'escola-1', turma: 'A', user_id: 'user-1' }],
  livros: [
    {
      id: 'livro-1',
      titulo: 'Livro Teste',
      autor: 'Autor X',
      area: 'Literatura',
      disponivel: true,
      sinopse: 'Sinopse',
      created_at: new Date().toISOString(),
    },
  ],
  solicitacoes_emprestimo: [
    {
      id: 'sol-1',
      livro_id: 'livro-1',
      usuario_id: 'aluno-1',
      status: 'pendente',
      created_at: new Date().toISOString(),
      livros: { titulo: 'Livro Teste', autor: 'Autor X' },
    },
  ],
  emprestimos: [],
  avaliacoes_livros: [],
  lista_desejos: [],
  sugestoes_livros: [],
  atividades_leitura: [],
  atividades_entregas: [],
  audiobooks_biblioteca: [],
  aluno_audiobooks: [],
  laboratorio_criacoes: [],
  notificacoes_lidas: [],
};

function createBuilder(table) {
  const state = { range: null };
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    or: () => builder,
    order: () => builder,
    range: (from, to) => {
      state.range = [from, to];
      return builder;
    },
    limit: () => builder,
    maybeSingle: async () => {
      if (table === 'usuarios_biblioteca') {
        return { data: tableData.usuarios_biblioteca[0], error: null };
      }
      return { data: null, error: null };
    },
    single: async () => ({ data: null, error: null }),
    insert: async () => ({ data: null, error: null }),
    upsert: async () => ({ data: null, error: null }),
    delete: () => builder,
    update: () => builder,
    then: (resolve, reject) => {
      const data = tableData[table] || [];
      const sliced = state.range ? data.slice(state.range[0], state.range[1] + 1) : data;
      Promise.resolve({ data: sliced, error: null }).then(resolve, reject);
    },
  };
  return builder;
}

vi.mock('@/integrations/supabase/client', () => {
  return {
    supabase: {
      from: (table) => createBuilder(table),
    },
  };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, isGestor: false, isBibliotecaria: false, isSuperAdmin: false }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/hooks/useRealtimeSubscription', () => ({
  useRealtimeSubscription: () => {},
}));

beforeEach(() => {
  localStorage.setItem('onboarding:aluno:user-1', 'done');
  tableData.solicitacoes_emprestimo = [
    {
      id: 'sol-1',
      livro_id: 'livro-1',
      usuario_id: 'aluno-1',
      status: 'pendente',
      created_at: new Date().toISOString(),
      livros: { titulo: 'Livro Teste', autor: 'Autor X' },
    },
  ];
});

function renderPainel(initialPath = '/aluno/perfil') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <PainelAluno />
    </MemoryRouter>,
  );
}

describe('PainelAluno', () => {
  it('bloqueia solicitacao duplicada no catalogo', async () => {
    renderPainel('/aluno/biblioteca');

    const bibliotecaTab = await screen.findByRole('button', { name: /^Biblioteca$/i });
    fireEvent.click(bibliotecaTab);

    const solicitarButton = await screen.findByRole('button', { name: /Já solicitado/i });
    expect(solicitarButton).toBeDisabled();
  });

  it('atalho de notificacoes leva para minhas solicitacoes', async () => {
    renderPainel();

    const aviso = await screen.findByText(/Solicitações pendentes/i);
    fireEvent.click(aviso);

    await waitFor(() => {
      expect(screen.getByText(/Minhas solicitações de empréstimo/i)).toBeInTheDocument();
    });
  });
});
