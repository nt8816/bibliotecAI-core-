import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requestPlatformApi } from '@/lib/platformApi';
import { addPlatformSessionListener } from '@/lib/platformSession';

import { projectQuizRanking } from '@/lib/quizRanking';

function QuizData({ telao, onFailure, onPresentingChange }) {
  const [rounds, setRounds] = useState(null);
  const [roundOffset, setRoundOffset] = useState(0);
  const [round, setRound] = useState('');
  const [ranking, setRanking] = useState(null);
  const [rankOffset, setRankOffset] = useState(0);
  const [contacts, setContacts] = useState(null);
  const [contactOffset, setContactOffset] = useState(0);
  const [showContacts, setShowContacts] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [presenting, setPresenting] = useState(false);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    if (!presenting) return undefined;
    const timer = window.setTimeout(() => setSlide(value => (value + 1) % 3), slide === 0 ? 30000 : 12000);
    return () => window.clearTimeout(timer);
  }, [presenting, slide]);

  useEffect(() => {
    if (!presenting) return undefined;
    const onKeyDown = event => { if (event.key === 'Escape') { setPresenting(false); onPresentingChange(false); } };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [presenting, onPresentingChange]);

  useEffect(() => {
    if (!telao) return undefined;
    const timer = window.setInterval(() => setRefresh(value => value + 1), 15000);
    return () => window.clearInterval(timer);
  }, [telao]);

  useEffect(() => {
    let active = true;
    requestPlatformApi(`/v1/admin/quiz/display/rounds?limit=20&offset=${roundOffset}`, { retryOnNetworkError: false })
      .then(result => { if (!Array.isArray(result?.data) || result.success !== true) throw new Error(); if (active) setRounds(result.data); })
      .catch(error => { if (active) onFailure(error); });
    return () => { active = false; };
  }, [roundOffset, refresh, onFailure]);

  useEffect(() => {
    let active = true;
    if (round) requestPlatformApi(`/v1/admin/quiz/display/leaderboard?round_id=${encodeURIComponent(round)}&limit=20&offset=${rankOffset}`, { retryOnNetworkError: false })
      .then(result => { if (!Array.isArray(result?.data) || result.success !== true) throw new Error(); if (active) setRanking(projectQuizRanking(result.data, telao)); })
      .catch(error => { if (active) onFailure(error); });
    return () => { active = false; };
  }, [round, rankOffset, refresh, onFailure, telao]);

  useEffect(() => {
    let active = true;
    setContacts(null);
    if (!telao && showContacts && round) requestPlatformApi(`/v1/admin/quiz/contacts?round_id=${encodeURIComponent(round)}&limit=20&offset=${contactOffset}`, { retryOnNetworkError: false })
      .then(result => { if (!Array.isArray(result?.data) || result.success !== true) throw new Error(); if (active) setContacts(result.data); })
      .catch(error => { if (active) onFailure(error); });
    return () => { active = false; };
  }, [telao, showContacts, round, contactOffset, onFailure]);

  const selectRound = id => { setRound(id); setRankOffset(0); setContactOffset(0); setShowContacts(false); setContacts(null); setRanking(null); };
  if (telao && !presenting) return <div className="mx-auto max-w-4xl space-y-8 py-10">
    <div><p className="text-sm font-bold uppercase tracking-[0.3em] text-emerald-300">Desafio leitor · BibliotecAI</p><h1 className="mt-3 text-4xl font-black sm:text-6xl">Preparar telão</h1><p className="mt-4 text-lg text-slate-300">Escolha a rodada antes de iniciar a apresentação. Pressione Esc para voltar a esta tela.</p></div>
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
      <h2 className="mb-4 text-xl font-bold">Escolha a rodada</h2>
      {rounds === null ? <p>Carregando rodadas...</p> : rounds.length === 0 ? <p>Nenhuma rodada nesta página.</p> : <div className="flex flex-wrap gap-2">{rounds.map(item => <button key={item.id} type="button" onClick={() => selectRound(item.id)} className={`rounded-full border px-4 py-3 font-semibold ${round === item.id ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-white/20 text-white hover:bg-white/10'}`}>{item.name} · {item.active ? 'Ativa' : 'Inativa'}</button>)}</div>}
      <div className="mt-5 flex gap-4 text-sm text-slate-300"><button disabled={roundOffset === 0} className="disabled:opacity-30" onClick={() => { selectRound(''); setRoundOffset(roundOffset - 20); }}>← Rodadas anteriores</button><button disabled={!rounds || rounds.length < 20 || roundOffset >= 10000} className="disabled:opacity-30" onClick={() => { selectRound(''); setRoundOffset(roundOffset + 20); }}>Próximas rodadas →</button></div>
      <button type="button" disabled={!round} onClick={() => { setSlide(0); setPresenting(true); onPresentingChange(true); }} className="mt-8 rounded-xl bg-emerald-300 px-6 py-4 font-bold text-slate-950 disabled:opacity-40">Iniciar apresentação</button>
    </div>
  </div>;
  if (telao) return <div className="flex min-h-[calc(100vh-4rem)] items-center text-[#eaf6ea]">
    {slide === 0 ? <div className="grid w-full items-center gap-8 lg:grid-cols-[0.9fr_1.4fr]">
      <div><img src="/quiz-telao-logo.svg" alt="" className="mb-6 w-28 sm:w-40" /><h1 className="text-5xl font-black leading-none tracking-tight text-white sm:text-7xl">Desafio<br />Leitor</h1><p className="mt-6 text-sm font-bold uppercase tracking-[0.2em] text-[#f9c846]">Ranking ao vivo</p><div className="mt-7 space-y-3 text-xl"><p><strong>Campus Party PI 2026</strong> · BibliotecAI</p><p>Jogue no celular ou no estande do <strong>BibliotecAI</strong>.</p><p className="text-sm text-[#a9c8ac]">● Atualizado a cada 15 segundos</p></div></div>
      <div className="rounded-3xl border border-[#7ac143]/30 bg-[#17432a] p-5 sm:p-8"><p className="mb-4 text-sm text-[#c4dec8]">Top 10 da rodada selecionada</p>{ranking === null ? <p>Carregando ranking...</p> : ranking.length === 0 ? <p className="py-12 text-center text-xl">Ainda não há resultados nesta rodada.</p> : <ol className="space-y-2">{ranking.slice(0, 10).map((item, index) => <li key={index} className={`flex items-center gap-4 rounded-xl border px-4 py-2 ${index === 0 ? 'border-[#f9c846]/50 bg-[#f9c846]/10' : 'border-[#7ac143]/20 bg-[#103823]'}`}><span className="w-10 text-xl font-black text-[#f9c846]">{String(index + 1).padStart(2, '0')}</span><span className="min-w-0 flex-1 break-words text-lg font-bold sm:text-2xl">{item.nickname || `Participante ${index + 1}`}</span><span className="text-xl font-black text-[#7ac143]">{item.xp} <small>XP</small></span></li>)}</ol>}</div>
    </div> : slide === 1 ? <div className="grid w-full items-center gap-12 lg:grid-cols-2"><div><p className="font-bold uppercase tracking-[0.3em] text-[#f9c846]">Conheça o BibliotecAI</p><h2 className="mt-6 text-5xl font-black leading-tight sm:text-7xl">Mais histórias.<br /><span className="text-[#7ac143]">Mais leitores.</span></h2><p className="mt-6 max-w-xl text-2xl">Uma plataforma para aproximar estudantes dos livros e apoiar a gestão da biblioteca escolar.</p></div><div className="space-y-4">{['Acervo e empréstimos organizados', 'Leitura com desafios e conquistas', 'Tecnologia a favor da educação'].map((text, index) => <div key={text} className="rounded-2xl border border-[#7ac143]/30 bg-[#17432a] p-6 text-2xl font-bold"><span className="mr-5 text-[#f9c846]">0{index + 1}</span>{text}</div>)}</div></div> : <div className="grid w-full items-center gap-12 lg:grid-cols-2"><div><p className="font-bold uppercase tracking-[0.3em] text-[#f9c846]">A próxima história começa aqui</p><h2 className="mt-8 text-5xl font-black leading-tight sm:text-7xl">Vamos transformar<br /><span className="text-[#7ac143]">a leitura juntos?</span></h2><p className="mt-8 max-w-2xl text-2xl">Conheça novas possibilidades para a biblioteca da sua escola.</p><p className="mt-10 inline-block rounded-xl bg-[#f9c846] px-8 py-4 text-2xl font-black text-[#0b2311]">bibliotecai.com.br</p></div><div className="flex min-h-[40vh] flex-col items-center justify-center rounded-3xl border border-[#7ac143]/30 bg-[#17432a] p-8 text-center"><span className="text-8xl text-[#f9c846]">✦</span><p className="text-4xl font-black sm:text-5xl">Abra um livro.<br />Abra caminhos.</p><p className="mt-8 tracking-[0.3em] text-[#7ac143]">BIBLIOTECAI</p></div></div>}
  </div>;
  return <div className="space-y-6">
    <Card><CardHeader><CardTitle>Rodadas</CardTitle><p className="text-sm text-muted-foreground">Escolha uma rodada para consultar seu ranking e, se necessário, os contatos. Os botões apenas selecionam a rodada; não alteram seu estado.</p><p className="text-sm text-muted-foreground"><strong>Ativa:</strong> aberta para jogar. <strong>Inativa:</strong> não está aberta agora; pode ser uma rodada futura ou encerrada. Os resultados existentes continuam disponíveis para consulta.</p></CardHeader><CardContent className="space-y-3">
      {rounds === null ? <p>Carregando rodadas...</p> : rounds.length === 0 ? <p>Nenhuma rodada nesta página.</p> : rounds.map(item => <div key={item.id}><Button variant={round === item.id ? 'default' : 'outline'} onClick={() => selectRound(item.id)}>{item.name} — {item.active ? 'Ativa' : 'Inativa'}</Button></div>)}
      <div className="flex gap-2"><Button variant="outline" disabled={roundOffset === 0} onClick={() => { selectRound(''); setRoundOffset(roundOffset - 20); }}>Anterior</Button><Button variant="outline" disabled={!rounds || rounds.length < 20 || roundOffset >= 10000} onClick={() => { selectRound(''); setRoundOffset(roundOffset + 20); }}>Próxima</Button><Button variant="outline" onClick={() => setRefresh(value => value + 1)}>Atualizar</Button></div>
    </CardContent></Card>
    {round && <Card><CardHeader><CardTitle>Ranking</CardTitle></CardHeader><CardContent className="space-y-3">
      {ranking === null ? <p>Carregando ranking...</p> : ranking.length === 0 ? <p>Nenhum resultado nesta página.</p> : <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{ranking.map((item, index) => <li key={`${rankOffset + index}`} className="flex items-start gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 font-bold text-primary">{rankOffset + index + 1}º</span><div className="min-w-0 flex-1"><p className="break-words font-bold">{item.nickname || `Participante ${rankOffset + index + 1}`}</p><p className="mt-1 text-lg font-bold text-primary">{item.xp} XP</p><p className="text-sm text-muted-foreground">{item.correct_count} acertos · {item.elapsed_ms} ms</p></div></li>)}</ol>}
      <div className="flex gap-2"><Button variant="outline" disabled={rankOffset === 0} onClick={() => setRankOffset(rankOffset - 20)}>Anterior</Button><Button variant="outline" disabled={!ranking || ranking.length < 20 || rankOffset >= 10000} onClick={() => setRankOffset(rankOffset + 20)}>Próxima</Button></div>
    </CardContent></Card>}
    {!telao && round && <Card><CardHeader><CardTitle>Contatos privados</CardTitle></CardHeader><CardContent className="space-y-3">
      {!showContacts ? <Button variant="outline" onClick={() => setShowContacts(true)}>Consultar contatos</Button> : <><Button variant="outline" onClick={() => { setShowContacts(false); setContacts(null); setContactOffset(0); }}>Ocultar contatos</Button>{contacts === null ? <p>Carregando contatos...</p> : contacts.length === 0 ? <p>Nenhum contato nesta página.</p> : contacts.map(item => <div key={item.game_id} className="rounded border p-3"><p>{item.nickname}{item.selected_winner && ' — Selecionado para conferência'}</p><p>E-mail: {item.email || '—'}</p><p>Telefone: {item.phone || '—'}</p></div>)}<div className="flex gap-2"><Button variant="outline" disabled={contactOffset === 0} onClick={() => { setContacts(null); setContactOffset(contactOffset - 20); }}>Anterior</Button><Button variant="outline" disabled={!contacts || contacts.length < 20 || contactOffset >= 10000} onClick={() => { setContacts(null); setContactOffset(contactOffset + 20); }}>Próxima</Button></div></>}
    </CardContent></Card>}
  </div>;
}

export default function AdminQuiz({ telao = false }) {
  const [status, setStatus] = useState('loading');
  const [presenting, setPresenting] = useState(false);
  const generation = useRef(0);

  const checkSession = useCallback(async () => {
    const current = ++generation.current;
    try {
      const result = await requestPlatformApi('/v1/admin/quiz/session', { retryOnNetworkError: false });
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
    const unsubscribe = addPlatformSessionListener((session) => {
      if (session?.access_token) return;
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
    <div className={telao ? 'min-h-screen bg-[radial-gradient(ellipse_at_top_left,#23673a,#0e2a15_55%)] px-6 py-8 text-white sm:px-12 lg:px-16' : 'space-y-6'}>
      {(!telao || status !== 'authorized') && <Card>
        <CardHeader><CardTitle>{telao ? 'Telão do quiz' : 'Painel do quiz'}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {status === 'loading' && <p>Verificando acesso ao quiz...</p>}
          {status === 'authorized' && <p>Acesso ao quiz confirmado.</p>}
          {status === 'locked' && <p role="alert">Você não tem permissão para acessar o quiz.</p>}
          {status === 'expired' && <p role="alert">Sessão expirada. Entre novamente para acessar o quiz.</p>}
          {status === 'unavailable' && <p role="alert">Serviço do quiz indisponível. Tente novamente mais tarde.</p>}
          {(status === 'unavailable' || status === 'expired') && <Button variant="outline" onClick={checkSession}>Tentar novamente</Button>}
        </CardContent>
      </Card>}
      {status === 'authorized' && <QuizData key={telao ? 'telao' : 'painel'} telao={telao} onFailure={handleDataFailure} onPresentingChange={setPresenting} />}
      {(!presenting || status !== 'authorized') && <Link className={telao ? "mt-8 inline-block text-sm text-slate-400 underline" : "text-sm underline"} to={telao ? '/admin/quiz' : '/admin/quiz/telao'}>{telao ? 'Voltar ao painel' : 'Abrir telão privado'}</Link>}
    </div>
  );
  return telao ? content : <MainLayout title="Quiz">{content}</MainLayout>;
}
