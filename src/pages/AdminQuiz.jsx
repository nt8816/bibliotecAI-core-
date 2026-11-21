import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requestPlatformApi } from '@/lib/platformApi';
import { addPlatformSessionListener } from '@/lib/platformSession';

import { projectQuizRanking } from '@/lib/quizRanking';

function QuizData({ telao, onFailure }) {
  const [rounds, setRounds] = useState(null);
  const [roundOffset, setRoundOffset] = useState(0);
  const [round, setRound] = useState('');
  const [ranking, setRanking] = useState(null);
  const [rankOffset, setRankOffset] = useState(0);
  const [contacts, setContacts] = useState(null);
  const [contactOffset, setContactOffset] = useState(0);
  const [showContacts, setShowContacts] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setRounds(null);
    requestPlatformApi(`/v1/admin/quiz/display/rounds?limit=20&offset=${roundOffset}`, { retryOnUnauthorized: false, retryOnNetworkError: false })
      .then(result => { if (!Array.isArray(result?.data) || result.success !== true) throw new Error(); if (active) setRounds(result.data); })
      .catch(error => { if (active) onFailure(error); });
    return () => { active = false; };
  }, [roundOffset, refresh, onFailure]);

  useEffect(() => {
    let active = true;
    setRanking(null);
    if (round) requestPlatformApi(`/v1/admin/quiz/display/leaderboard?round_id=${encodeURIComponent(round)}&limit=20&offset=${rankOffset}`, { retryOnUnauthorized: false, retryOnNetworkError: false })
      .then(result => { if (!Array.isArray(result?.data) || result.success !== true) throw new Error(); if (active) setRanking(projectQuizRanking(result.data, telao)); })
      .catch(error => { if (active) onFailure(error); });
    return () => { active = false; };
  }, [round, rankOffset, refresh, onFailure, telao]);

  useEffect(() => {
    let active = true;
    setContacts(null);
    if (!telao && showContacts && round) requestPlatformApi(`/v1/admin/quiz/contacts?round_id=${encodeURIComponent(round)}&limit=20&offset=${contactOffset}`, { retryOnUnauthorized: false, retryOnNetworkError: false })
      .then(result => { if (!Array.isArray(result?.data) || result.success !== true) throw new Error(); if (active) setContacts(result.data); })
      .catch(error => { if (active) onFailure(error); });
    return () => { active = false; };
  }, [telao, showContacts, round, contactOffset, onFailure]);

  const selectRound = id => { setRound(id); setRankOffset(0); setContactOffset(0); setShowContacts(false); setContacts(null); setRanking(null); };
  return <div className="space-y-6">
    <Card><CardHeader><CardTitle>Rodadas</CardTitle></CardHeader><CardContent className="space-y-3">
      {rounds === null ? <p>Carregando rodadas...</p> : rounds.length === 0 ? <p>Nenhuma rodada nesta página.</p> : rounds.map(item => <div key={item.id}><Button variant={round === item.id ? 'default' : 'outline'} onClick={() => selectRound(item.id)}>{item.name} — {item.active ? 'Ativa' : 'Inativa'}</Button></div>)}
      <div className="flex gap-2"><Button variant="outline" disabled={roundOffset === 0} onClick={() => { selectRound(''); setRoundOffset(roundOffset - 20); }}>Anterior</Button><Button variant="outline" disabled={!rounds || rounds.length < 20 || roundOffset >= 10000} onClick={() => { selectRound(''); setRoundOffset(roundOffset + 20); }}>Próxima</Button><Button variant="outline" onClick={() => setRefresh(value => value + 1)}>Atualizar</Button></div>
    </CardContent></Card>
    {round && <Card><CardHeader><CardTitle>Ranking</CardTitle></CardHeader><CardContent className="space-y-3">
      {ranking === null ? <p>Carregando ranking...</p> : ranking.length === 0 ? <p>Nenhum resultado nesta página.</p> : <ol className="space-y-2">{ranking.map((item, index) => <li key={index}>{rankOffset + index + 1}. {telao ? `Participante ${rankOffset + index + 1}` : item.nickname} — {item.xp} XP · {item.correct_count} acertos · {item.elapsed_ms} ms</li>)}</ol>}
      <div className="flex gap-2"><Button variant="outline" disabled={rankOffset === 0} onClick={() => setRankOffset(rankOffset - 20)}>Anterior</Button><Button variant="outline" disabled={!ranking || ranking.length < 20 || rankOffset >= 10000} onClick={() => setRankOffset(rankOffset + 20)}>Próxima</Button></div>
    </CardContent></Card>}
    {!telao && round && <Card><CardHeader><CardTitle>Contatos privados</CardTitle></CardHeader><CardContent className="space-y-3">
      {!showContacts ? <Button variant="outline" onClick={() => setShowContacts(true)}>Consultar contatos</Button> : <><Button variant="outline" onClick={() => { setShowContacts(false); setContacts(null); setContactOffset(0); }}>Ocultar contatos</Button>{contacts === null ? <p>Carregando contatos...</p> : contacts.length === 0 ? <p>Nenhum contato nesta página.</p> : contacts.map(item => <div key={item.game_id} className="rounded border p-3"><p>{item.nickname}{item.selected_winner && ' — Selecionado para conferência'}</p><p>E-mail: {item.email || '—'}</p><p>Telefone: {item.phone || '—'}</p></div>)}<div className="flex gap-2"><Button variant="outline" disabled={contactOffset === 0} onClick={() => { setContacts(null); setContactOffset(contactOffset - 20); }}>Anterior</Button><Button variant="outline" disabled={!contacts || contacts.length < 20 || contactOffset >= 10000} onClick={() => { setContacts(null); setContactOffset(contactOffset + 20); }}>Próxima</Button></div></>}
    </CardContent></Card>}
  </div>;
}

export default function AdminQuiz({ telao = false }) {
  const [status, setStatus] = useState('loading');
  const generation = useRef(0);

  const checkSession = useCallback(async () => {
    const current = ++generation.current;
    try {
      const result = await requestPlatformApi('/v1/admin/quiz/session', { retryOnUnauthorized: false, retryOnNetworkError: false });
      if (current === generation.current) setStatus(result?.success === true ? 'authorized' : 'unavailable');
    } catch (error) {
      if (current === generation.current) setStatus(error.status === 403 ? 'locked' : error.status === 401 ? 'expired' : 'unavailable');
    }
  }, []);

  useEffect(() => {
    checkSession();
    const timer = window.setInterval(checkSession, 30000);
    const onVisible = () => { if (document.visibilityState === 'visible') checkSession(); };
    document.addEventListener('visibilitychange', onVisible);
    const unsubscribe = addPlatformSessionListener(() => {
      generation.current += 1;
      setStatus('expired');
    });
    return () => { generation.current += 1; unsubscribe(); window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [checkSession]);

  const handleDataFailure = useCallback((error) => {
    generation.current += 1;
    setStatus(error?.status === 403 ? 'locked' : error?.status === 401 ? 'expired' : 'unavailable');
  }, []);

  const content = (
    <div className={telao ? 'mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-6 p-8' : 'space-y-6'}>
      <Card>
        <CardHeader><CardTitle>{telao ? 'Telão do quiz' : 'Painel do quiz'}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {status === 'loading' && <p>Verificando acesso ao quiz...</p>}
          {status === 'authorized' && <p>Acesso ao quiz confirmado.</p>}
          {status === 'locked' && <p role="alert">Você não tem permissão para acessar o quiz.</p>}
          {status === 'expired' && <p role="alert">Sessão expirada. Entre novamente para acessar o quiz.</p>}
          {status === 'unavailable' && <p role="alert">Serviço do quiz indisponível. Tente novamente mais tarde.</p>}
          {(status === 'unavailable' || status === 'expired') && <Button variant="outline" onClick={checkSession}>Tentar novamente</Button>}
        </CardContent>
      </Card>
      {status === 'authorized' && <QuizData key={telao ? 'telao' : 'painel'} telao={telao} onFailure={handleDataFailure} />}
      <Link className="text-sm underline" to={telao ? '/admin/quiz' : '/admin/quiz/telao'}>{telao ? 'Voltar ao painel' : 'Abrir telão privado'}</Link>
    </div>
  );
  return telao ? content : <MainLayout title="Quiz">{content}</MainLayout>;
}
