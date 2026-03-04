import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useAuth } from '@/hooks/useAuth';

export function useSystemNotifications() {
  const { isGestor, isBibliotecaria, isAluno, user } = useAuth();
  const [counts, setCounts] = useState({ atrasados: 0, solicitacoesPendentes: 0 });

  const canView = isGestor || isBibliotecaria || isAluno;

  const fetchCounts = useCallback(async () => {
    if (!canView) {
      setCounts({ atrasados: 0, solicitacoesPendentes: 0 });
      return;
    }

    if (isAluno && user?.id) {
      const { data: perfil } = await supabase
        .from('usuarios_biblioteca')
        .select('id')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!perfil?.id) {
        setCounts({ atrasados: 0, solicitacoesPendentes: 0 });
        return;
      }

      const [atrasadosRes, solicitacoesRes] = await Promise.all([
        supabase
          .from('emprestimos')
          .select('id', { count: 'exact', head: true })
          .eq('usuario_id', perfil.id)
          .eq('status', 'ativo')
          .lt('data_devolucao_prevista', new Date().toISOString()),
        supabase
          .from('solicitacoes_emprestimo')
          .select('id', { count: 'exact', head: true })
          .eq('usuario_id', perfil.id)
          .eq('status', 'pendente'),
      ]);

      setCounts({
        atrasados: atrasadosRes.count || 0,
        solicitacoesPendentes: solicitacoesRes.count || 0,
      });
      return;
    }

    const [atrasadosRes, solicitacoesRes] = await Promise.all([
      supabase.from('emprestimos').select('id', { count: 'exact', head: true }).eq('status', 'ativo').lt('data_devolucao_prevista', new Date().toISOString()),
      supabase.from('solicitacoes_emprestimo').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
    ]);

    setCounts({
      atrasados: atrasadosRes.count || 0,
      solicitacoesPendentes: solicitacoesRes.count || 0,
    });
  }, [canView, isAluno, user?.id]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  useRealtimeSubscription({ table: 'emprestimos', onChange: fetchCounts });
  useRealtimeSubscription({ table: 'solicitacoes_emprestimo', onChange: fetchCounts });

  return { counts, canViewNotifications: canView };
}
