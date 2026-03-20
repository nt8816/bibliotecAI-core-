import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useAuth } from '@/hooks/useAuth';

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeTurmaKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function useSystemNotifications() {
  const { isGestor, isBibliotecaria, isAluno, user } = useAuth();
  const [counts, setCounts] = useState({ atrasados: 0, solicitacoesPendentes: 0, comunicados: 0 });
  const [notifications, setNotifications] = useState([]);
  const [profileId, setProfileId] = useState(null);

  const canView = isGestor || isBibliotecaria || isAluno;

  const fetchCounts = useCallback(async () => {
    if (!canView || !user?.id) {
      setCounts({ atrasados: 0, solicitacoesPendentes: 0, comunicados: 0 });
      setNotifications([]);
      setProfileId(null);
      return;
    }

    const { data: perfil, error: perfilError } = await supabase
      .from('usuarios_biblioteca')
      .select('id, escola_id, turma')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (perfilError || !perfil?.id) {
      setCounts({ atrasados: 0, solicitacoesPendentes: 0, comunicados: 0 });
      setNotifications([]);
      setProfileId(null);
      return;
    }

    setProfileId(perfil.id);

    if (isAluno) {
      const [atrasadosRes, solicitacoesRes, comunicadosRes, notificacoesLidasRes] = await Promise.all([
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
        perfil.escola_id
          ? supabase
              .from('comunidade_posts')
              .select('id, titulo, conteudo, turma_publico, created_at')
              .eq('escola_id', perfil.escola_id)
              .eq('tipo', 'comunicado')
              .order('created_at', { ascending: false })
              .limit(20)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('notificacoes_lidas')
          .select('notification_id')
          .eq('usuario_id', perfil.id),
      ]);

      const turmaAluno = normalizeTurmaKey(perfil.turma);
      const lidas = new Set(ensureArray(notificacoesLidasRes.data).map((item) => item.notification_id));
      const comunicados = ensureArray(comunicadosRes.data)
        .filter((item) => {
          const turmaComunicado = normalizeTurmaKey(item?.turma_publico);
          return !turmaComunicado || turmaComunicado === turmaAluno;
        })
        .map((item) => ({
          id: `comunicado-${item.id}`,
          tipo: 'comunicado',
          titulo: item.titulo || 'Novo comunicado',
          descricao: item.conteudo || 'Confira o comunicado da sua turma na comunidade.',
          created_at: item.created_at || null,
          path: '/aluno/comunidade',
        }))
        .filter((item) => !lidas.has(item.id));

      setCounts({
        atrasados: atrasadosRes.count || 0,
        solicitacoesPendentes: solicitacoesRes.count || 0,
        comunicados: comunicados.length,
      });
      setNotifications(comunicados);
      return;
    }

    if (!perfil.escola_id) {
      setCounts({ atrasados: 0, solicitacoesPendentes: 0, comunicados: 0 });
      setNotifications([]);
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
      comunicados: 0,
    });
    setNotifications([]);
  }, [canView, isAluno, user?.id]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  useRealtimeSubscription({ table: 'emprestimos', onChange: fetchCounts });
  useRealtimeSubscription({ table: 'solicitacoes_emprestimo', onChange: fetchCounts });
  useRealtimeSubscription({ table: 'comunidade_posts', onChange: fetchCounts });
  useRealtimeSubscription({ table: 'notificacoes_lidas', onChange: fetchCounts });

  const markNotificationRead = useCallback(
    async (notificationId) => {
      if (!profileId || !notificationId) return;

      setNotifications((prev) => ensureArray(prev).filter((item) => item.id !== notificationId));
      setCounts((prev) => ({
        ...prev,
        comunicados: Math.max(0, (prev.comunicados || 0) - (String(notificationId).startsWith('comunicado-') ? 1 : 0)),
      }));

      const { error } = await supabase
        .from('notificacoes_lidas')
        .upsert({ usuario_id: profileId, notification_id: notificationId }, { onConflict: 'usuario_id,notification_id' });

      if (error) {
        await fetchCounts();
      }
    },
    [fetchCounts, profileId],
  );

  return { counts, notifications, canViewNotifications: canView, markNotificationRead };
}
