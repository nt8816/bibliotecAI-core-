import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AudioLines, BellRing, CalendarClock, Mic, Megaphone, PauseCircle, Send, Upload, Users, X } from 'lucide-react';
import { Navigate } from 'react-router-dom';

import { MainLayout } from '@/components/layout/MainLayout';
import { AudioMessagePlayer } from '@/components/community/AudioMessagePlayer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { createComunidadePost, fetchComunidadeAlunoData } from '@/services/comunidadeAlunoService';
import { uploadFileToR2 } from '@/lib/r2Storage';
import { resolveR2MediaUrl, resolveR2MediaUrls } from '@/lib/resolveR2Media';
import { cn } from '@/lib/utils';

const ALL_TURMAS_OPTION = '__all_turmas__';

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

function formatDateTimeBR(value) {
  if (!value) return '-';
  try {
    return format(new Date(value), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR });
  } catch {
    return '-';
  }
}

function toEndOfDayIso(dateValue) {
  if (!dateValue) return null;
  const localDate = new Date(`${dateValue}T23:59:59.999`);
  return Number.isNaN(localDate.getTime()) ? null : localDate.toISOString();
}

function getTodayInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isExpiredComunicado(post) {
  if (!post?.expires_at) return false;
  const expiresAt = new Date(post.expires_at);
  return !Number.isNaN(expiresAt.getTime()) && expiresAt <= new Date();
}

async function getAudioDurationFromUrl(audioUrl) {
  if (!audioUrl) return null;
  return new Promise((resolve) => {
    const audio = new Audio();
    const finish = (value) => {
      audio.removeAttribute('src');
      audio.load();
      resolve(Number.isFinite(value) ? Math.round(value) : null);
    };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => finish(audio.duration);
    audio.onerror = () => finish(null);
    audio.src = audioUrl;
  });
}

function buildAudioFileFromBlob(blob) {
  const mimeType = String(blob?.type || '').trim() || 'audio/webm';
  const extension = mimeType.includes('mp4')
    ? 'm4a'
    : mimeType.includes('ogg')
      ? 'ogg'
      : mimeType.includes('mpeg')
        ? 'mp3'
        : 'webm';

  return new File([blob], `gravacao-comunicado-${Date.now()}.${extension}`, { type: mimeType });
}

function formatRecordingClock(totalSeconds) {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, '0');
  const seconds = String(safeSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

async function resolveComunicadoMedia(post) {
  return {
    ...(post || {}),
    imagem_urls: await resolveR2MediaUrls(ensureArray(post?.imagem_urls), `comunicado-${post?.id || 'item'}`),
    audio_url: await resolveR2MediaUrl(post?.audio_url, `comunicado-${post?.id || 'item'}.webm`),
  };
}

export default function Comunicados() {
  const { userRole, isAluno, isProfessor, isGestor, isBibliotecaria, isSuperAdmin } = useAuth();
  const { toast } = useToast();

  const canPublish = (isProfessor || isGestor || isBibliotecaria) && !isSuperAdmin;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [perfil, setPerfil] = useState(null);
  const [posts, setPosts] = useState([]);
  const [turmasPublicacao, setTurmasPublicacao] = useState([]);
  const [titulo, setTitulo] = useState('');
  const [conteudo, setConteudo] = useState('');
  const [turmaPublico, setTurmaPublico] = useState('');
  const [expiraEm, setExpiraEm] = useState('');
  const [audioFile, setAudioFile] = useState(null);
  const [busca, setBusca] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const audioInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const minComunicadoDate = getTodayInputValue();

  useEffect(() => () => {
    if (audioFile?.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(audioFile.previewUrl);
    }

    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, [audioFile]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const response = await fetchComunidadeAlunoData();
        if (cancelled) return;

        const perfilAtual = response?.perfil || null;
        const comunicados = ensureArray(response?.posts)
          .filter((item) => item?.tipo === 'comunicado' && !isExpiredComunicado(item));
        const resolvedPosts = await Promise.all(comunicados.map(resolveComunicadoMedia));
        if (cancelled) return;

        setPerfil(perfilAtual);
        setPosts(resolvedPosts);
        setTurmasPublicacao(ensureArray(response?.turmasPublicacao));
      } catch (error) {
        if (cancelled) return;
        toast({
          variant: 'destructive',
          title: 'Erro ao carregar comunicados',
          description: error?.message || 'Nao foi possivel carregar os comunicados agora.',
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const comunicadosVisiveis = useMemo(() => {
    const turmaAluno = normalizeTurmaKey(perfil?.turma);
    let list = ensureArray(posts);

    if (isAluno) {
      list = list.filter((post) => {
        const turmaDestino = normalizeTurmaKey(post?.turma_publico);
        return !turmaDestino || turmaDestino === turmaAluno;
      });
    }

    const term = busca.trim().toLowerCase();
    if (term) {
      list = list.filter((post) => {
        return String(post?.titulo || '').toLowerCase().includes(term)
          || String(post?.conteudo || '').toLowerCase().includes(term)
          || String(post?.turma_publico || 'todas as turmas').toLowerCase().includes(term);
      });
    }

    return list.sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime());
  }, [busca, isAluno, perfil?.turma, posts]);

  const setSelectedAudioFile = async (file) => {
    if (!file) return;

    if (!String(file.type || '').startsWith('audio/')) {
      toast({
        variant: 'destructive',
        title: 'Arquivo invalido',
        description: 'Selecione um arquivo de audio valido.',
      });
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'Audio muito grande',
        description: 'O limite para audio em comunicados e 20MB.',
      });
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    const durationSeconds = await getAudioDurationFromUrl(previewUrl);

    if (audioFile?.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(audioFile.previewUrl);
    }

    setAudioFile({
      file,
      previewUrl,
      fileName: file.name,
      durationSeconds,
    });
  };

  const handleSelectAudioFile = async (files) => {
    const file = files?.[0];
    await setSelectedAudioFile(file);
  };

  const stopRecordingResources = () => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  const startRecording = async () => {
    if (isRecording) return;

    if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast({
        variant: 'destructive',
        title: 'Gravacao indisponivel',
        description: 'Este dispositivo nao oferece suporte para gravacao de audio no navegador/app.',
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);

      recordingChunksRef.current = [];
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = mediaRecorder;
      setRecordingSeconds(0);
      setIsRecording(true);

      mediaRecorder.addEventListener('dataavailable', (event) => {
        if (event.data && event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      });

      mediaRecorder.addEventListener('stop', async () => {
        const blob = new Blob(recordingChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
        recordingChunksRef.current = [];
        setIsRecording(false);
        setRecordingSeconds(0);
        stopRecordingResources();

        if (blob.size > 0) {
          const recordedFile = buildAudioFileFromBlob(blob);
          await setSelectedAudioFile(recordedFile);
          toast({ title: 'Audio gravado com sucesso!' });
        }
      });

      mediaRecorder.start();
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((current) => current + 1);
      }, 1000);
    } catch (error) {
      setIsRecording(false);
      stopRecordingResources();
      toast({
        variant: 'destructive',
        title: 'Permissao negada',
        description: 'Libere o microfone para gravar audio no navegador ou no app.',
      });
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      stopRecordingResources();
      setIsRecording(false);
      return;
    }
    recorder.stop();
  };

  const clearAudio = () => {
    if (isRecording) {
      stopRecording();
    }
    if (audioFile?.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(audioFile.previewUrl);
    }
    setAudioFile(null);
    setRecordingSeconds(0);
    if (audioInputRef.current) {
      audioInputRef.current.value = '';
    }
  };

  const clearForm = () => {
    setTitulo('');
    setConteudo('');
    setTurmaPublico('');
    setExpiraEm('');
    clearAudio();
  };

  const handlePublish = async () => {
    if (!canPublish || !perfil?.id || !perfil?.escola_id) return;

    if (!titulo.trim() && !conteudo.trim() && !audioFile?.file) {
      toast({
        variant: 'destructive',
        title: 'Comunicado vazio',
        description: 'Adicione um titulo, um texto ou um audio antes de publicar.',
      });
      return;
    }

    if (!turmaPublico) {
      toast({
        variant: 'destructive',
        title: 'Selecione o destino',
        description: 'Escolha a turma que deve receber este comunicado.',
      });
      return;
    }

    if (expiraEm && expiraEm < minComunicadoDate) {
      toast({
        variant: 'destructive',
        title: 'Data invalida',
        description: 'A data final precisa ser hoje ou uma data futura.',
      });
      return;
    }

    setSaving(true);
    try {
      const uploadedAudio = audioFile?.file
        ? await uploadFileToR2({
            file: audioFile.file,
            escolaId: perfil.escola_id,
            ownerId: perfil.id,
            scope: 'comunicados-audio',
          })
        : null;

      const payload = {
        tipo: 'comunicado',
        titulo: titulo.trim() || 'Novo comunicado',
        conteudo: conteudo.trim() || 'Confira este novo comunicado.',
        turma_publico: turmaPublico === ALL_TURMAS_OPTION ? null : turmaPublico,
        expires_at: toEndOfDayIso(expiraEm),
        tags: ['comunicado'],
        audio_url: uploadedAudio?.objectKey || null,
        audio_duration_seconds: audioFile?.durationSeconds || null,
      };

      const result = await createComunidadePost(payload);
      const createdPost = await resolveComunicadoMedia({
        id: result?.postId || crypto.randomUUID(),
        ...payload,
        created_at: new Date().toISOString(),
      });

      setPosts((prev) => [createdPost, ...prev]);
      clearForm();
      toast({ title: 'Comunicado publicado!' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Falha ao publicar',
        description: error?.message || 'Nao foi possivel publicar o comunicado.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (isSuperAdmin || userRole === 'super_admin') {
    return <Navigate to="/admin/tenants" replace />;
  }

  return (
    <MainLayout title="Comunicados">
      <div className="space-y-6">
        <Card className="overflow-hidden border-emerald-200/70 bg-[linear-gradient(135deg,rgba(236,253,245,0.95),rgba(255,255,255,0.98),rgba(240,253,250,0.95))]">
          <CardContent className="grid gap-5 p-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-4">
              <Badge className="w-fit rounded-full bg-emerald-600 px-3 py-1 text-white">
                <Megaphone className="mr-1.5 h-3.5 w-3.5" /> Canal oficial da escola
              </Badge>
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Comunicados em destaque</h2>
                <p className="max-w-2xl text-sm leading-6 text-slate-600">
                  Um espaco proprio para avisos da escola, da biblioteca e dos professores. Os alunos acompanham tudo daqui,
                  mas somente a equipe pode publicar novos comunicados.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-[24px] border border-white/70 bg-white/80 p-4 shadow-sm">
                <p className="text-xs uppercase tracking-[0.22em] text-emerald-700/80">Ativos agora</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{comunicadosVisiveis.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {canPublish && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Novo comunicado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Titulo</Label>
                  <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Aviso sobre a prova de leitura" />
                </div>
                <div className="space-y-2">
                  <Label>Destino</Label>
                  <select
                    value={turmaPublico || 'none'}
                    onChange={(e) => setTurmaPublico(e.target.value === 'none' ? '' : e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="none">Selecione o destino</option>
                    <option value={ALL_TURMAS_OPTION}>Todas as turmas</option>
                    {turmasPublicacao.map((turma) => (
                      <option key={turma} value={turma}>{turma}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[1fr_220px]">
                <div className="space-y-2">
                  <Label>Mensagem</Label>
                  <Textarea
                    rows={5}
                    value={conteudo}
                    onChange={(e) => setConteudo(e.target.value)}
                    placeholder="Escreva o aviso principal para os alunos e a equipe."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Remover em</Label>
                  <Input type="date" min={minComunicadoDate} value={expiraEm} onChange={(e) => setExpiraEm(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Opcional. Depois dessa data o comunicado some automaticamente.</p>
                </div>
              </div>

              <div className="rounded-[28px] border border-emerald-200/80 bg-emerald-50/70 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <Label className="flex items-center gap-2 text-base text-emerald-900">
                      <AudioLines className="h-4 w-4" /> Audio do comunicado
                    </Label>
                    <p className="text-sm text-emerald-800/80">
                      Grave com o microfone ou escolha um arquivo ja salvo no aparelho. O audio sera salvo no Cloudflare R2.
                    </p>
                  </div>
                  <input
                    ref={audioInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => handleSelectAudioFile(e.target.files)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={isRecording ? 'destructive' : 'default'}
                      className={cn(
                        'rounded-full transition-all duration-200 active:scale-95',
                        isRecording && 'record-button-live',
                      )}
                      onClick={isRecording ? stopRecording : startRecording}
                    >
                      {isRecording ? <PauseCircle className="mr-2 h-4 w-4 animate-pulse" /> : <Mic className="mr-2 h-4 w-4" />}
                      {isRecording ? `Parar gravacao (${formatRecordingClock(recordingSeconds)})` : 'Gravar audio'}
                    </Button>
                    <Button type="button" variant="outline" className="rounded-full" onClick={() => audioInputRef.current?.click()}>
                      <Upload className="mr-2 h-4 w-4" />
                      {audioFile ? 'Trocar arquivo' : 'Adicionar audio'}
                    </Button>
                  </div>
                </div>

                {isRecording ? (
                  <div className="record-status-enter mt-4 rounded-2xl border border-rose-200 bg-white/85 px-4 py-3 text-sm text-rose-700 shadow-[0_12px_24px_rgba(244,63,94,0.08)]">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-2.5 w-2.5 rounded-full bg-rose-500 animate-pulse" />
                      <span className="font-medium">Gravando agora: {formatRecordingClock(recordingSeconds)}</span>
                    </div>
                    <p className="mt-1 text-rose-700/80">
                      O aplicativo/navegador pode pedir permissao do microfone nesta etapa.
                    </p>
                  </div>
                ) : null}

                {audioFile ? (
                  <div className="mt-4 space-y-3">
                    <AudioMessagePlayer
                      src={audioFile.previewUrl}
                      title={audioFile.fileName || 'Previa do audio'}
                      durationSeconds={audioFile.durationSeconds}
                    />
                    <div className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3 text-sm">
                      <span className="truncate">{audioFile.fileName}</span>
                      <Button type="button" variant="ghost" size="sm" onClick={clearAudio}>
                        <X className="mr-1 h-3.5 w-3.5" /> Remover
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex justify-end">
                <Button onClick={handlePublish} disabled={saving}>
                  <Send className="mr-2 h-4 w-4" />
                  {saving ? 'Publicando...' : 'Publicar comunicado'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Mural de comunicados</CardTitle>
              <p className="text-sm text-muted-foreground">Avisos organizados em um espaco proprio, sem misturar com a comunidade.</p>
            </div>
            <div className="w-full sm:max-w-xs">
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar comunicado..." />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Carregando comunicados...</p>
            ) : comunicadosVisiveis.length === 0 ? (
              <div className="rounded-[28px] border border-dashed p-8 text-center">
                <BellRing className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Nenhum comunicado disponivel agora.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {comunicadosVisiveis.map((post) => (
                  <div key={post.id} className="rounded-[30px] border border-border/70 bg-card/95 p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_34px_rgba(15,23,42,0.06)]">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-lg font-semibold text-slate-900">{post.titulo || 'Novo comunicado'}</p>
                          <Badge variant="destructive">Comunicado</Badge>
                          <Badge variant="outline">
                            <Users className="mr-1 h-3.5 w-3.5" />
                            {post.turma_publico || 'Todas as turmas'}
                          </Badge>
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{post.conteudo || 'Sem mensagem adicional.'}</p>
                      </div>
                      <div className="shrink-0 rounded-2xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <CalendarClock className="h-3.5 w-3.5" />
                          {formatDateTimeBR(post.created_at)}
                        </div>
                        {post.expires_at ? <p className="mt-1">Sai em {formatDateTimeBR(post.expires_at)}</p> : null}
                      </div>
                    </div>

                    {post.audio_url ? (
                      <div className="mt-4">
                        <AudioMessagePlayer
                          src={post.audio_url}
                          title="Audio do comunicado"
                          durationSeconds={post.audio_duration_seconds}
                        />
                      </div>
                    ) : null}

                    {ensureArray(post.imagem_urls).length > 0 ? (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {ensureArray(post.imagem_urls).slice(0, 4).map((img, index) => (
                          <img key={`${post.id}-${index}`} src={img} alt={`Imagem ${index + 1}`} className="h-40 w-full rounded-2xl border object-cover" />
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
