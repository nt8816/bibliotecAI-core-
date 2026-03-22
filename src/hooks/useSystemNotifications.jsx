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

function isExpiredComunicado(item) {
  if (!item?.expires_at) return false;
  const expiresAt = new Date(item.expires_at);
  return !Number.isNaN(expiresAt.getTime()) && expiresAt <= new Date();
}

export function useSystemNotifications() {
  const { isGestor, isBibliotecaria, isAluno, isSuperAdmin, user } = useAuth();
  const [counts, setCounts] = useState({
    atrasados: 0,
    solicitacoesPendentes: 0,
    comunicados: 0,
    reclamacoes: 0,
    reclamacoesAtrasadas: 0,
    seguranca: 0,
  });
  const [notifications, setNotifications] = useState([]);
  const [profileId, setProfileId] = useState(null);

  const canView = isGestor || isBibliotecaria || isAluno || isSuperAdmin;

  const fetchCounts = useCallback(async () => {
    if (!canView || !user?.id) {
      setCounts({ atrasados: 0, solicitacoesPendentes: 0, comunicados: 0, reclamacoes: 0, reclamacoesAtrasadas: 0, seguranca: 0 });
      setNotifications([]);
      setProfileId(null);
      return;
    }

    if (isSuperAdmin) {
      const complaintReadKey = `notificacoes:reclamacoes:lidas:${user.id}`;
      const securityReadKey = `notificacoes:seguranca-super-admin:lidas:${user.id}`;
      const reclamacoesLidas = new Set(JSON.parse(localStorage.getItem(complaintReadKey) || '[]'));
      const segurancaLidas = new Set(JSON.parse(localStorage.getItem(securityReadKey) || '[]'));

      const [complaintsRes, securityRes] = await Promise.all([
        supabase.rpc('get_reclamacoes_super_admin_feed'),
        supabase
          .from('system_logs')
          .select('id, event, message, created_at')
          .in('event', ['super_admin_login_failed', 'super_admin_account_locked'])
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      if (complaintsRes.error || securityRes.error) {
        setCounts({ atrasados: 0, solicitacoesPendentes: 0, comunicados: 0, reclamacoes: 0, reclamacoesAtrasadas: 0, seguranca: 0 });
        setNotifications([]);
        setProfileId(null);
        return;
      }

      const reclamacoesNaoLidas = ensureArray(complaintsRes.data)
        .map((item) => {
          const escolaNome = item?.escola_nome || 'Escola nao identificada';
          const remetente = item?.sender_nome || 'Usuario';
          const role = String(item?.sender_role || '').trim().toLowerCase();
          const turma = item?.sender_turma ? ` • Turma ${item.sender_turma}` : '';
          const contextoAluno = role === 'aluno' ? turma : '';

          return {
            id: `reclamacao-${item.id}`,
            tipo: 'reclamacao',
            titulo: item?.assunto || 'Reclamacao',
            descricao: `${escolaNome} • ${remetente}${contextoAluno}`,
            created_at: item?.created_at || null,
            path: '/reclamacoes',
            status: item?.status || 'em_analise',
            lida_em: item?.lida_em || null,
          };
        })
        .filter((item) => item.status === 'em_analise')
        .filter((item) => !item.lida_em)
        .filter((item) => !reclamacoesLidas.has(item.id));

      const reclamacoesAtrasadas = ensureArray(complaintsRes.data)
        .filter((item) => item?.status === 'em_analise' && item?.alerta_prazo)
        .map((item) => ({
          id: `reclamacao-alerta-${item.id}`,
          tipo: 'reclamacao_alerta',
          titulo: 'Reclamacao parada ha mais de 4 dias',
          descricao: `${item?.escola_nome || 'Escola nao identificada'} • ${item?.sender_nome || 'Usuario'}`,
          created_at: item?.updated_at || item?.created_at || null,
          path: '/reclamacoes',
        }))
        .filter((item) => !reclamacoesLidas.has(item.id));

      const alertasSeguranca = ensureArray(securityRes.data)
        .map((item) => ({
          id: `seguranca-${item.id}`,
          tipo: 'seguranca',
          titulo: item?.event === 'super_admin_account_locked' ? 'Conta bloqueada' : 'Tentativa de invasao',
          descricao: item?.message || 'Alerta de seguranca para Super Admin.',
          created_at: item?.created_at || null,
          path: '/admin/logs',
        }))
        .filter((item) => !segurancaLidas.has(item.id));

      const mergedNotifications = [...alertasSeguranca, ...reclamacoesAtrasadas, ...reclamacoesNaoLidas]
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

      setCounts({
        atrasados: 0,
        solicitacoesPendentes: 0,
        comunicados: 0,
        reclamacoes: reclamacoesNaoLidas.length + reclamacoesAtrasadas.length,
        reclamacoesAtrasadas: reclamacoesAtrasadas.length,
        seguranca: alertasSeguranca.length,
      });
      setNotifications(mergedNotifications);
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
      setCounts({ atrasados: 0, solicitacoesPendentes: 0, comunicados: 0, reclamacoes: 0, reclamacoesAtrasadas: 0, seguranca: 0 });
      setNotifications([]);
      setProfileId(null);
      return;
    }

    setProfileId(perfil.id);

    if (isAluno) {
      await supabase.rpc('cleanup_expired_comunicados');

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
              .select('id, titulo, conteudo, turma_publico, created_at, expires_at')
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
          if (isExpiredComunicado(item)) return false;
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
        reclamacoes: 0,
        reclamacoesAtrasadas: 0,
        seguranca: 0,
      });
      setNotifications(comunicados);
      return;
    }

    if (!perfil.escola_id) {
      setCounts({ atrasados: 0, solicitacoesPendentes: 0, comunicados: 0, reclamacoes: 0, reclamacoesAtrasadas: 0, seguranca: 0 });
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
      reclamacoes: 0,
      reclamacoesAtrasadas: 0,
      seguranca: 0,
    });
    setNotifications([]);
  }, [canView, isAluno, isSuperAdmin, user?.id]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  useRealtimeSubscription({ table: 'emprestimos', onChange: fetchCounts });
  useRealtimeSubscription({ table: 'solicitacoes_emprestimo', onChange: fetchCounts });
  useRealtimeSubscription({ table: 'comunidade_posts', onChange: fetchCounts });
  useRealtimeSubscription({ table: 'notificacoes_lidas', onChange: fetchCounts });
  useRealtimeSubscription({ table: 'reclamacoes_super_admin', onChange: fetchCounts });
  useRealtimeSubscription({ table: 'system_logs', onChange: fetchCounts });

  const markNotificationRead = useCallback(
    async (notificationId) => {
      if (!notificationId) return;

      if ((String(notificationId).startsWith('reclamacao-') || String(notificationId).startsWith('reclamacao-alerta-')) && user?.id) {
        const readKey = `notificacoes:reclamacoes:lidas:${user.id}`;
        const current = new Set(JSON.parse(localStorage.getItem(readKey) || '[]'));
        current.add(notificationId);
        localStorage.setItem(readKey, JSON.stringify(Array.from(current)));

        setNotifications((prev) => ensureArray(prev).filter((item) => item.id !== notificationId));
        setCounts((prev) => ({
          ...prev,
          reclamacoes: Math.max(0, (prev.reclamacoes || 0) - 1),
          reclamacoesAtrasadas: String(notificationId).startsWith('reclamacao-alerta-')
            ? Math.max(0, (prev.reclamacoesAtrasadas || 0) - 1)
            : prev.reclamacoesAtrasadas || 0,
        }));
        return;
      }

      if (String(notificationId).startsWith('seguranca-') && user?.id) {
        const readKey = `notificacoes:seguranca-super-admin:lidas:${user.id}`;
        const current = new Set(JSON.parse(localStorage.getItem(readKey) || '[]'));
        current.add(notificationId);
        localStorage.setItem(readKey, JSON.stringify(Array.from(current)));

        setNotifications((prev) => ensureArray(prev).filter((item) => item.id !== notificationId));
        setCounts((prev) => ({
          ...prev,
          seguranca: Math.max(0, (prev.seguranca || 0) - 1),
        }));
        return;
      }

      if (!profileId) return;

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
    [fetchCounts, profileId, user?.id],
  );

  return { counts, notifications, canViewNotifications: canView, markNotificationRead };
}
