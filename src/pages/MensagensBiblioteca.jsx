import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle,
  Clock3,
  Inbox,
  Loader2,
  MessageSquare,
  Send,
  UserRound,
  XCircle,
} from 'lucide-react';

import { MainLayout } from '@/components/layout/MainLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { getSupabaseRealtimeClient } from '@/integrations/supabase/client';
import {
  approveSolicitacaoEmprestimo,
  fetchEmprestimosData,
  markSolicitacaoLivroIndisponivel,
  rejectSolicitacaoEmprestimo,
  sendSolicitacaoEmprestimoChatMessage,
} from '@/services/emprestimosService';
import {
  fetchPainelAlunoData,
  sendPainelAlunoSolicitacaoChatMessage,
} from '@/services/painelAlunoService';
import { markSystemNotificationsAsReadBatch } from '@/services/notificationsService';

function formatDateTimeBR(value) {
  if (!value) return '-';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return '-';
  }
}

function formatDateBR(value) {
  if (!value) return '-';
  try {
    return new Intl.DateTimeFormat('pt-BR').format(new Date(value));
  } catch {
    return '-';
  }
}

function normalizeStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function buildUnreadNotificationIdsForBibliotecaria(solicitacao) {
  const mensagens = Array.isArray(solicitacao?.solicitacoes_emprestimo_mensagens)
    ? solicitacao.solicitacoes_emprestimo_mensagens
    : [];

  return mensagens
    .filter((mensagem) => String(mensagem?.autor_tipo || '').toLowerCase() === 'aluno' && mensagem?.id)
    .map((mensagem) => `solicitacao-chat-${solicitacao.id}-${mensagem.id}`);
}

function getThreadStatusBadge(status) {
  if (status === 'aprovada' || status === 'aceita') return <Badge>Aprovada</Badge>;
  if (status === 'recusada' || status === 'negada' || status === 'cancelada') return <Badge variant="destructive">Recusada</Badge>;
  if (status === 'indisponivel_em_analise') return <Badge variant="outline">Sob análise</Badge>;
  return <Badge variant="secondary">Pendente</Badge>;
}

function buildSolicitacaoEvents(solicitacao, emprestimos) {
  const events = [];
  const status = normalizeStatus(solicitacao?.status);
  const isExtension = String(solicitacao?.tipo || 'emprestimo') === 'prorrogacao';
  const chatMensagens = Array.isArray(solicitacao?.solicitacoes_emprestimo_mensagens)
    ? solicitacao.solicitacoes_emprestimo_mensagens
    : [];

  if (solicitacao?.created_at) {
    events.push({
      id: `solicitacao-${solicitacao.id}`,
      type: 'event',
      created_at: solicitacao.created_at,
      title: isExtension ? 'Prorrogação solicitada' : 'Solicitação criada',
      body: solicitacao?.mensagem || (isExtension ? 'O aluno pediu uma nova data de devolução.' : 'Novo pedido de empréstimo enviado.'),
    });
  }

  chatMensagens.forEach((mensagem) => {
    const isBiblioteca = mensagem?.autor_tipo === 'bibliotecaria';
    events.push({
      id: `chat-${solicitacao.id}-${mensagem.id}`,
      type: 'message',
      created_at: mensagem?.created_at,
      author: isBiblioteca ? 'Biblioteca' : 'Aluno',
      fromBiblioteca: isBiblioteca,
      body: mensagem?.mensagem || '',
    });
  });

  if (solicitacao?.respondido_em || solicitacao?.updated_at) {
    if (status === 'aprovada' || status === 'aceita') {
      events.push({
        id: `status-${solicitacao.id}-aprovada`,
        type: 'event',
        created_at: solicitacao?.respondido_em || solicitacao?.updated_at,
        title: isExtension ? 'Prorrogação aprovada' : 'Solicitação aprovada',
        body: solicitacao?.resposta || 'A biblioteca aprovou esta conversa.',
      });
    }

    if (status === 'recusada' || status === 'negada' || status === 'cancelada') {
      events.push({
        id: `status-${solicitacao.id}-recusada`,
        type: 'event',
        created_at: solicitacao?.respondido_em || solicitacao?.updated_at,
        title: isExtension ? 'Prorrogação recusada' : 'Solicitação recusada',
        body: solicitacao?.resposta || 'A biblioteca encerrou esta solicitação.',
      });
    }

    if (status === 'indisponivel_em_analise') {
      events.push({
        id: `status-${solicitacao.id}-analise`,
        type: 'event',
        created_at: solicitacao?.updated_at,
        title: 'Livro em análise',
        body: solicitacao?.resposta || 'A biblioteca iniciou a análise deste pedido.',
      });
    }
  }

  const emprestimosRelacionados = (Array.isArray(emprestimos) ? emprestimos : [])
    .filter((item) => {
      if (solicitacao?.emprestimo_id && item?.id === solicitacao.emprestimo_id) return true;
      return item?.livro_id && item?.livro_id === solicitacao?.livro_id && item?.usuario_id === solicitacao?.usuario_id;
    });

  emprestimosRelacionados.forEach((emprestimo) => {
    if (emprestimo?.data_emprestimo) {
      events.push({
        id: `emprestimo-${emprestimo.id}-criado`,
        type: 'event',
        created_at: emprestimo.data_emprestimo,
        title: 'Empréstimo registrado',
        body: `Devolução prevista para ${formatDateBR(emprestimo.data_devolucao_prevista)}.`,
      });
    }

    if (emprestimo?.data_devolucao_real) {
      events.push({
        id: `emprestimo-${emprestimo.id}-devolvido`,
        type: 'event',
        created_at: emprestimo.data_devolucao_real,
        title: 'Livro devolvido',
        body: 'O empréstimo foi encerrado e saiu da fila de atendimento.',
      });
    }
  });

  return events
    .filter((item) => item.created_at)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export default function MensagensBiblioteca() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isAluno, isBibliotecaria } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [threads, setThreads] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [drafts, setDrafts] = useState({});
  const readNotificationIdsRef = useRef(new Set());
  const mountedRef = useRef(true);

  const canAccess = isAluno || isBibliotecaria;
  const selectedParam = searchParams.get('solicitacao');

  const fetchData = useCallback(async () => {
    if (!canAccess || !user?.id) {
      setThreads([]);
      setLoading(false);
      return;
    }

    try {
      const payload = isBibliotecaria
        ? await fetchEmprestimosData({ userId: user.id, canManageLoans: true })
        : await fetchPainelAlunoData();

      const emprestimos = Array.isArray(payload?.emprestimos) ? payload.emprestimos : [];
      const solicitacoes = Array.isArray(payload?.solicitacoes) ? payload.solicitacoes : [];
      const nextThreads = solicitacoes
        .map((solicitacao) => {
          const items = buildSolicitacaoEvents(solicitacao, emprestimos);
          const lastActivity = items[items.length - 1]?.created_at || solicitacao?.updated_at || solicitacao?.created_at || null;
          return {
            ...solicitacao,
            timelineItems: items,
            lastActivity,
          };
        })
        .sort((a, b) => new Date(b?.lastActivity || 0).getTime() - new Date(a?.lastActivity || 0).getTime());

      setThreads(nextThreads);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar mensagens',
        description: error?.message || 'Não foi possível carregar as conversas da biblioteca.',
      });
    } finally {
      setLoading(false);
    }
  }, [canAccess, isBibliotecaria, toast, user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!canAccess || !user?.id) return undefined;
    mountedRef.current = true;

    const handleVisibilityChange = () => {
      if (mountedRef.current && document.visibilityState === 'visible') {
        fetchData();
      }
    };

    const interval = window.setInterval(() => {
      if (mountedRef.current) fetchData();
    }, 8000);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mountedRef.current = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [canAccess, fetchData, user?.id]);

  useEffect(() => {
    if (!canAccess || !user?.id) return undefined;

    const supabase = getSupabaseRealtimeClient();
    if (!supabase) return undefined;

    const channel = supabase.channel(`mensagens-biblioteca-${user.id}`);
    ['solicitacoes_emprestimo', 'solicitacoes_emprestimo_mensagens', 'emprestimos'].forEach((table) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        fetchData();
      });
    });
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canAccess, fetchData, user?.id]);

  useEffect(() => {
    if (!threads.length) {
      setSelectedId('');
      return;
    }

    const preferredId = selectedParam && threads.some((item) => item.id === selectedParam) ? selectedParam : '';
    if (preferredId) {
      setSelectedId(preferredId);
      return;
    }

    if (!selectedId || !threads.some((item) => item.id === selectedId)) {
      setSelectedId(threads[0].id);
    }
  }, [selectedId, selectedParam, threads]);

  useEffect(() => {
    readNotificationIdsRef.current = new Set();
  }, [user?.id]);

  const selectedThread = useMemo(
    () => threads.find((item) => item.id === selectedId) || null,
    [selectedId, threads],
  );

  useEffect(() => {
    if (!isBibliotecaria || !selectedThread?.id) return;

    const notificationIds = buildUnreadNotificationIdsForBibliotecaria(selectedThread)
      .filter((notificationId) => !readNotificationIdsRef.current.has(notificationId));

    if (notificationIds.length === 0) return;

    notificationIds.forEach((notificationId) => {
      readNotificationIdsRef.current.add(notificationId);
    });

    markSystemNotificationsAsReadBatch(notificationIds).catch(() => {
      notificationIds.forEach((notificationId) => {
        readNotificationIdsRef.current.delete(notificationId);
      });
    });
  }, [isBibliotecaria, selectedThread]);

  const handleSelectThread = useCallback((threadId) => {
    setSelectedId(threadId);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('solicitacao', threadId);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const handleSendMessage = useCallback(async () => {
    if (!selectedThread?.id) return;

    const mensagem = String(drafts[selectedThread.id] || '').trim();
    if (!mensagem) {
      toast({
        variant: 'destructive',
        title: 'Mensagem obrigatória',
        description: isBibliotecaria
          ? 'Escreva uma mensagem para responder ao aluno.'
          : 'Escreva uma mensagem para falar com a biblioteca.',
      });
      return;
    }

    setSaving(true);
    try {
      if (isBibliotecaria) {
        await sendSolicitacaoEmprestimoChatMessage(selectedThread.id, mensagem);
      } else {
        await sendPainelAlunoSolicitacaoChatMessage({ solicitacaoId: selectedThread.id, mensagem });
      }

      setDrafts((prev) => ({ ...prev, [selectedThread.id]: '' }));
      await fetchData();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao enviar mensagem',
        description: error?.message || 'Não foi possível enviar a mensagem.',
      });
    } finally {
      setSaving(false);
    }
  }, [drafts, fetchData, isBibliotecaria, selectedThread, toast]);

  const runLibraryAction = useCallback(async (type) => {
    if (!isBibliotecaria || !selectedThread?.id) return;

    const resposta = String(drafts[selectedThread.id] || '').trim();
    setSaving(true);
    setActionLoading(type);
    try {
      if (type === 'aprovar') {
        await approveSolicitacaoEmprestimo(selectedThread.id, resposta || 'Solicitação aprovada pela biblioteca.');
      }
      if (type === 'recusar') {
        await rejectSolicitacaoEmprestimo(selectedThread.id, resposta || 'Solicitação recusada pela biblioteca.');
      }
      if (type === 'analise') {
        await markSolicitacaoLivroIndisponivel(selectedThread.id, resposta || 'Livro marcado como indisponível e em análise pela biblioteca.');
      }

      setDrafts((prev) => ({ ...prev, [selectedThread.id]: '' }));
      await fetchData();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao atualizar solicitação',
        description: error?.message || 'Não foi possível concluir essa ação.',
      });
    } finally {
      setSaving(false);
      setActionLoading(null);
    }
  }, [drafts, fetchData, isBibliotecaria, selectedThread, toast]);

  if (!canAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  const selectedStatus = normalizeStatus(selectedThread?.status);
  const isOpenThread = !['aprovada', 'aceita', 'recusada', 'negada', 'cancelada'].includes(selectedStatus);
  const isPendente = selectedStatus === 'pendente';
  const canMarkAnalise = isBibliotecaria && isPendente && selectedThread?.livros?.disponivel !== false;

  return (
    <MainLayout title="Mensagens">
      <div className="grid gap-4 lg:grid-cols-[320px,minmax(0,1fr)]">
        <Card className="min-h-[70vh]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Inbox className="h-4 w-4" />
              Conversas da biblioteca
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Carregando conversas...
              </div>
            ) : threads.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Nenhuma conversa de empréstimo encontrada.
              </p>
            ) : (
              <div className="space-y-2">
                {threads.map((thread) => {
                  const isActive = thread.id === selectedId;
                  const lastItem = thread.timelineItems[thread.timelineItems.length - 1];
                  return (
                    <button
                      key={thread.id}
                      type="button"
                      onClick={() => handleSelectThread(thread.id)}
                      className={`w-full rounded-xl border p-3 text-left transition-colors ${
                        isActive ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{thread.livros?.titulo || 'Livro'}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {isBibliotecaria ? (thread.usuarios_biblioteca?.nome || 'Aluno') : (thread.livros?.autor || '-')}
                          </p>
                        </div>
                        {getThreadStatusBadge(thread.status)}
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                        {lastItem?.body || thread.resposta || thread.mensagem || 'Sem atualizações ainda.'}
                      </p>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Última atividade: {formatDateTimeBR(thread.lastActivity)}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-h-[70vh]">
          <CardHeader className="border-b pb-4">
            {selectedThread ? (
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MessageSquare className="h-4 w-4" />
                    {selectedThread.livros?.titulo || 'Conversa'}
                  </CardTitle>
                  <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                    <p>{selectedThread.livros?.autor || '-'}</p>
                    <p className="flex items-center gap-2">
                      <UserRound className="h-3.5 w-3.5" />
                      {selectedThread.usuarios_biblioteca?.nome || 'Aluno'}
                    </p>
                    <p className="flex items-center gap-2">
                      <Clock3 className="h-3.5 w-3.5" />
                      Aberta em {formatDateTimeBR(selectedThread.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {getThreadStatusBadge(selectedThread.status)}
                  <Badge variant="outline">
                    {String(selectedThread?.tipo || 'emprestimo') === 'prorrogacao' ? 'Prorrogação' : 'Empréstimo'}
                  </Badge>
                </div>
              </div>
            ) : (
              <CardTitle className="text-base">Selecione uma conversa</CardTitle>
            )}
          </CardHeader>

          <CardContent className="flex h-[calc(70vh-88px)] flex-col gap-4 pt-4">
            {!selectedThread ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Escolha uma conversa na coluna ao lado.
              </div>
            ) : (
              <>
                <ScrollArea className="flex-1 rounded-xl border bg-muted/10 p-4">
                  <div className="space-y-3">
                    {selectedThread.timelineItems.map((item) => {
                      if (item.type === 'event') {
                        return (
                          <div key={item.id} className="rounded-xl border bg-background px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.title}</p>
                            <p className="mt-1 text-sm">{item.body}</p>
                            <p className="mt-2 text-[11px] text-muted-foreground">{formatDateTimeBR(item.created_at)}</p>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={item.id}
                          className={`max-w-[88%] rounded-xl border px-4 py-3 text-sm ${
                            item.fromBiblioteca ? 'ml-auto border-primary/20 bg-primary/10' : 'mr-auto bg-background'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                            <span>{item.author}</span>
                            <span>{formatDateTimeBR(item.created_at)}</span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap">{item.body}</p>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>

                {selectedThread?.mensagem && (
                  <div className="rounded-xl border bg-muted/20 p-3 text-sm">
                    <p className="text-xs font-medium text-muted-foreground">Mensagem inicial</p>
                    <p className="mt-1 whitespace-pre-wrap">{selectedThread.mensagem}</p>
                  </div>
                )}

                {isOpenThread ? (
                  <div className="space-y-3">
                    <Textarea
                      rows={3}
                      placeholder={isBibliotecaria ? 'Escreva sua resposta para o aluno...' : 'Escreva sua mensagem para a biblioteca...'}
                      value={drafts[selectedThread.id] || ''}
                      onChange={(event) => setDrafts((prev) => ({ ...prev, [selectedThread.id]: event.target.value }))}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      disabled={saving}
                    />

                    <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                      <Button type="button" onClick={handleSendMessage} disabled={saving}>
                        {saving && !actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                        Enviar mensagem
                      </Button>

                      {isBibliotecaria && (
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="secondary" disabled={!canMarkAnalise || saving} onClick={() => runLibraryAction('analise')}>
                            {actionLoading === 'analise' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-2 h-4 w-4" />}
                            Marcar sob análise
                          </Button>
                          <Button type="button" variant="outline" disabled={saving} onClick={() => runLibraryAction('recusar')}>
                            {actionLoading === 'recusar' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                            Recusar
                          </Button>
                          <Button type="button" disabled={saving} onClick={() => runLibraryAction('aprovar')}>
                            {actionLoading === 'aprovar' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                            Aprovar
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    Esta conversa foi finalizada. O histórico do atendimento e do empréstimo continua disponível aqui.
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
