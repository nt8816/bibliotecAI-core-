import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useAuth } from '@/hooks/useAuth';

export function useSystemNotifications() {
  const { isGestor, isBibliotecaria, isAluno, user } = useAuth();
  const [counts, setCounts] = useState({ atrasados: 0, solicitacoesPendentes: 0 });

  const canView = isGestor || isBibliotecaria || isAluno;

  const fetchCounts = useCallback(async () => {
    if (!canView || !user?.id) {
      setCounts({ atrasados: 0, solicitacoesPendentes: 0 });
      return;
    }

    const { data: perfil, error: perfilError } = await supabase
      .from('usuarios_biblioteca')
      .select('id, escola_id')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (perfilError || !perfil?.id) {
      setCounts({ atrasados: 0, solicitacoesPendentes: 0 });
      return;
    }

    if (isAluno) {
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
          .in('status', ['pendente', 'em_andamento']),
      ]);

      setCounts({
        atrasados: atrasadosRes.count || 0,
        solicitacoesPendentes: solicitacoesRes.count || 0,
      });
      return;
    }

    if (!perfil.escola_id) {
      setCounts({ atrasados: 0, solicitacoesPendentes: 0 });
      return;
    }

    const [atrasadosRes, solicitacoesRes] = await Promise.all([
      supabase
        .from('emprestimos')
        .select('id, usuarios_biblioteca!inner(escola_id)', { count: 'exact', head: true })
        .eq('status', 'ativo')
        .lt('data_devolucao_prevista', new Date().toISOString())
        .eq('usuarios_biblioteca.escola_id', perfil.escola_id),
      supabase
        .from('solicitacoes_emprestimo')
        .select('id, usuarios_biblioteca!inner(escola_id)', { count: 'exact', head: true })
        .in('status', ['pendente', 'em_andamento'])
        .eq('usuarios_biblioteca.escola_id', perfil.escola_id),
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
