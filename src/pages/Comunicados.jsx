import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AudioLines, BellRing, CalendarClock, CheckCircle2, Download, FileQuestion, ImagePlus, Mic, Megaphone, PauseCircle, Plus, Send, Trash2, Upload, Users, X } from 'lucide-react';
import { Navigate } from 'react-router-dom';

import { MainLayout } from '@/components/layout/MainLayout';
import { AudioMessagePlayer } from '@/components/community/AudioMessagePlayer';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { createComunidadePost, deleteComunidadePost, fetchComunidadeAlunoData } from '@/services/comunidadeAlunoService';
import { fetchProfessorPainelData, saveProfessorAtividade } from '@/services/professorService';
import { deleteR2Object, getR2DownloadUrl, uploadFileToR2 } from '@/lib/r2Storage';
import { resolveR2MediaUrl, resolveR2MediaUrls } from '@/lib/resolveR2Media';
import { cn } from '@/lib/utils';

const ALL_TURMAS_OPTION = '__all_turmas__';
const FORM_MARKER = '[FORM_CONFIG_V1]';
const COMUNICADOS_FORM_MARKER = '[FORM_ORIGIN_COMUNICADOS_V1]';

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

function smoothLevel(previous, next, weight = 0.7) {
  return previous * weight + next * (1 - weight);
}

function createPendingImage(file) {
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    previewUrl: URL.createObjectURL(file),
  };
}

function downloadFromUrl(url, fileName = 'arquivo') {
  if (!url) return;
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.target = '_blank';
  link.rel = 'noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function repairMojibakeText(value) {
  const text = String(value ?? '');
  if (!text || !/[ÃÂ]/.test(text)) return text;
  try {
    return decodeURIComponent(escape(text));
  } catch {
    return text;
  }
}

async function resolveComunicadoMedia(post) {
  return {
    ...(post || {}),
    imagem_urls_r2_keys: ensureArray(post?.imagem_urls),
    audio_url_r2_key: String(post?.audio_url || '').trim(),
    imagem_urls: await resolveR2MediaUrls(ensureArray(post?.imagem_urls), `comunicado-${post?.id || 'item'}`),
    audio_url: await resolveR2MediaUrl(post?.audio_url, `comunicado-${post?.id || 'item'}.webm`),
  };
}

function decodeJsonBase64(value) {
  try {
    const decoded = decodeURIComponent(escape(atob(String(value || ''))));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function extractAtividadeFormConfig(descricao) {
  const source = String(descricao || '');
  const idx = source.indexOf(FORM_MARKER);

  if (idx < 0) {
    return { descricaoLimpa: source, perguntas: [] };
  }

  const descricaoLimpa = source.slice(0, idx).trim();
  const encoded = source.slice(idx + FORM_MARKER.length).trim();
  const parsed = decodeJsonBase64(encoded);
  const perguntas = ensureArray(parsed?.perguntas);

  return { descricaoLimpa, perguntas };
}

function isComunicadosFormActivity(descricao) {
  return String(descricao || '').includes(COMUNICADOS_FORM_MARKER);
}

function serializeFormularioDescricao(descricao, perguntas) {
  const descricaoLimpa = String(descricao || '').trim();
  const perguntasNormalizadas = ensureArray(perguntas)
    .map((pergunta, index) => ({
      id: String(pergunta?.id || `q_${index + 1}`),
      tipo: pergunta?.tipo === 'multipla_escolha' ? 'multipla_escolha' : 'texto',
      pergunta: String(pergunta?.pergunta || '').trim(),
      opcoes: pergunta?.tipo === 'multipla_escolha'
        ? ensureArray(pergunta?.opcoes).map((item) => String(item || '').trim()).filter(Boolean)
        : [],
      correta: Number.isInteger(pergunta?.correta) ? pergunta.correta : null,
    }))
    .filter((pergunta) => pergunta.pergunta);

  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify({ perguntas: perguntasNormalizadas }))));
  const prefix = `${COMUNICADOS_FORM_MARKER}\n${descricaoLimpa}`.trim();
  return `${prefix}${prefix ? '\n\n' : ''}${FORM_MARKER}${encoded}`;
}

function createQuestionId() {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptyFormQuestion() {
  return {
    id: createQuestionId(),
    tipo: 'texto',
    pergunta: '',
    opcoes: ['', ''],
    correta: null,
  };
}

function parseEntregaPayload(rawText) {
  const source = String(rawText || '');
  const marker = '[ENTREGA_PAYLOAD_V1]';
  if (!source.startsWith(marker)) {
    return {
      texto: source,
      imagens: [],
      respostas: {},
    };
  }

  const parsed = decodeJsonBase64(source.slice(marker.length).trim()) || {};
  return {
    texto: String(parsed?.texto || ''),
    imagens: Array.isArray(parsed?.imagens) ? parsed.imagens.filter((item) => typeof item === 'string') : [],
    respostas: parsed?.respostas && typeof parsed.respostas === 'object' ? parsed.respostas : {},
  };
}

function formatDateLabel(value) {
  if (!value) return 'Sem prazo';
  try {
    return format(new Date(value), 'dd/MM/yyyy', { locale: ptBR });
  } catch {
    return 'Sem prazo';
  }
}

function getAtividadeTargetSummary(atividade) {
  const turma = atividade?.usuarios_biblioteca?.turma;
  const aluno = atividade?.usuarios_biblioteca?.nome;
  return aluno ? `${aluno}${turma ? ` â€¢ ${turma}` : ''}` : (turma || 'Destino individual');
}

export default function Comunicados() {
  const { userRole, isAluno, isProfessor, isGestor, isBibliotecaria, isSuperAdmin } = useAuth();
  const { toast } = useToast();

  const canPublish = (isProfessor || isGestor || isBibliotecaria) && !isSuperAdmin;
  const profileRoleHint = isProfessor
    ? 'professor'
    : isGestor
      ? 'gestor'
      : isBibliotecaria
        ? 'bibliotecaria'
        : userRole === 'super_admin'
          ? 'super_admin'
          : isAluno
            ? 'aluno'
            : '';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [perfil, setPerfil] = useState(null);
  const [posts, setPosts] = useState([]);
  const [professorAtividades, setProfessorAtividades] = useState([]);
  const [professorEntregas, setProfessorEntregas] = useState([]);
  const [turmasPublicacao, setTurmasPublicacao] = useState([]);
  const [titulo, setTitulo] = useState('');
  const [conteudo, setConteudo] = useState('');
  const [turmaPublico, setTurmaPublico] = useState('');
  const [expiraEm, setExpiraEm] = useState('');
  const [audioFile, setAudioFile] = useState(null);
  const [pendingImages, setPendingImages] = useState([]);
  const [busca, setBusca] = useState('');
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [selectedImagePreview, setSelectedImagePreview] = useState({ src: '', title: 'Visualizacao da imagem' });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isFormularioDialogOpen, setIsFormularioDialogOpen] = useState(false);
  const [formularioSaving, setFormularioSaving] = useState(false);
  const [selectedFormulario, setSelectedFormulario] = useState(null);
  const [formularioForm, setFormularioForm] = useState({
    titulo: '',
    descricao: '',
    turma: '',
    data_entrega: '',
    perguntas: [createEmptyFormQuestion()],
  });
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingLevels, setRecordingLevels] = useState(() => Array.from({ length: 24 }, () => 0.18));
  const audioInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const recordingLevelsRef = useRef(Array.from({ length: 24 }, () => 0.18));
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const animationFrameRef = useRef(null);
  const minComunicadoDate = getTodayInputValue();

  useEffect(() => () => {
    if (audioFile?.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(audioFile.previewUrl);
    }

    ensureArray(pendingImages).forEach((image) => {
      if (image?.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(image.previewUrl);
      }
    });

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

    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => null);
      audioContextRef.current = null;
    }
  }, [audioFile, pendingImages]);

  const loadData = useCallback(async () => {
    let cancelled = false;
    try {
      setLoading(true);
      const [response, professorData] = await Promise.all([
        fetchComunidadeAlunoData({ roleHint: profileRoleHint }),
        isProfessor ? fetchProfessorPainelData() : Promise.resolve(null),
      ]);
      if (cancelled) return;

      const perfilAtual = response?.perfil || null;
      const comunicados = ensureArray(response?.posts)
        .filter((item) => item?.tipo === 'comunicado' && !isExpiredComunicado(item));
      const resolvedPosts = await Promise.all(comunicados.map(resolveComunicadoMedia));
      if (cancelled) return;

      setPerfil(perfilAtual);
      setPosts(resolvedPosts);
      setTurmasPublicacao(ensureArray(response?.turmasPublicacao));
      setProfessorAtividades(ensureArray(professorData?.atividades));
      setProfessorEntregas(ensureArray(professorData?.entregas));
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
    return () => {
      cancelled = true;
    };
  }, [isProfessor, profileRoleHint, toast]);

  useEffect(() => {
    let active = true;
    loadData();
    return () => {
      active = false;
      if (!active) return;
    };
  }, [loadData]);

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

  const formulariosProfessor = useMemo(() => (
    ensureArray(professorAtividades)
      .map((atividade) => {
        const meta = extractAtividadeFormConfig(atividade?.descricao);
        const respostas = ensureArray(professorEntregas)
          .filter((entrega) => String(entrega?.atividade_id || '').trim() === String(atividade?.id || '').trim());
        return {
          ...atividade,
          meta,
          respostas,
        };
      })
      .filter((atividade) => isComunicadosFormActivity(atividade?.descricao) && atividade.meta.perguntas.length > 0)
      .sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime())
  ), [professorAtividades, professorEntregas]);

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
      durationSeconds,
    });
  };

  const handleSelectImages = async (files) => {
    const selectedFiles = Array.from(files || []);
    if (selectedFiles.length === 0) return;

    const invalidFiles = selectedFiles.filter((file) => !String(file.type || '').startsWith('image/'));
    if (invalidFiles.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Arquivo invalido',
        description: 'Essa area aceita apenas imagens.',
      });
      return;
    }

    setPendingImages((current) => {
      const currentList = ensureArray(current);
      const availableSlots = Math.max(0, 4 - currentList.length);
      const acceptedFiles = selectedFiles.slice(0, availableSlots);
      const discardedFiles = selectedFiles.slice(availableSlots);
      const nextSelection = acceptedFiles.map(createPendingImage);

      if (discardedFiles.length > 0) {
        toast({
          title: 'Limite de imagens atingido',
          description: 'Cada comunicado aceita no máximo 4 imagens.',
        });
      }

      return [...currentList, ...nextSelection];
    });
  };

  const handleSelectAudioFile = async (files) => {
    const file = files?.[0];
    await setSelectedAudioFile(file);
  };

  const removePendingImage = (imageId) => {
    setPendingImages((current) => {
      const found = ensureArray(current).find((image) => image.id === imageId);
      if (found?.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(found.previewUrl);
      }
      return ensureArray(current).filter((image) => image.id !== imageId);
    });
  };

  const handleDownloadPendingImage = (image) => {
    if (!image?.previewUrl) return;
    downloadFromUrl(image.previewUrl, image?.file?.name || 'imagem-comunicado');
  };

  const handleDownloadPublishedImage = async (post, index) => {
    const objectKey = ensureArray(post?.imagem_urls_r2_keys)[index];
    const resolvedUrl = ensureArray(post?.imagem_urls)[index];
    const fileName = `comunicado-imagem-${index + 1}.jpg`;

    try {
      if (objectKey) {
        const downloadUrl = await getR2DownloadUrl(objectKey, fileName);
        downloadFromUrl(downloadUrl, fileName);
        return;
      }

      downloadFromUrl(resolvedUrl, fileName);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Falha no download',
        description: error?.message || 'Nao foi possivel baixar a imagem agora.',
      });
    }
  };

  const openImagePreview = (src, title = 'Visualizacao da imagem') => {
    if (!src) return;
    setSelectedImagePreview({ src, title });
    setImagePreviewOpen(true);
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

    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => null);
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    recordingLevelsRef.current = Array.from({ length: 24 }, () => 0.18);
    setRecordingLevels(recordingLevelsRef.current);
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
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      const audioContext = AudioContextCtor ? new AudioContextCtor() : null;
      const analyser = audioContext ? audioContext.createAnalyser() : null;
      const sourceNode = audioContext ? audioContext.createMediaStreamSource(stream) : null;

      recordingChunksRef.current = [];
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = mediaRecorder;
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceNodeRef.current = sourceNode;
      setRecordingSeconds(0);
      setIsRecording(true);
      recordingLevelsRef.current = Array.from({ length: 24 }, () => 0.2);
      setRecordingLevels(recordingLevelsRef.current);

      if (audioContext && analyser && sourceNode) {
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.58;
        sourceNode.connect(analyser);

        const frequencyData = new Uint8Array(analyser.frequencyBinCount);
        const updateLevels = () => {
          analyser.getByteFrequencyData(frequencyData);

          const nextLevels = Array.from({ length: 24 }, (_, index) => {
            const bucketSize = Math.max(1, Math.floor(frequencyData.length / 24));
            const start = index * bucketSize;
            const end = Math.min(frequencyData.length, start + bucketSize);
            let total = 0;
            let count = 0;

            for (let cursor = start; cursor < end; cursor += 1) {
              total += frequencyData[cursor];
              count += 1;
            }

            const normalized = count > 0 ? total / count / 255 : 0;
            const boosted = Math.min(1, Math.pow(normalized * 1.9, 0.9));
            const ripple = (Math.sin((performance.now() / 140) + index * 0.75) + 1) * 0.035;
            const previous = recordingLevelsRef.current[index] ?? 0.18;
            const smoothed = smoothLevel(previous, Math.max(0.08, boosted + ripple), boosted > previous ? 0.42 : 0.74);
            return Math.max(0.08, Math.min(1, smoothed));
          });

          recordingLevelsRef.current = nextLevels;
          setRecordingLevels([...nextLevels]);
          animationFrameRef.current = window.requestAnimationFrame(updateLevels);
        };

        animationFrameRef.current = window.requestAnimationFrame(updateLevels);
      }

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

  const clearPendingImages = () => {
    ensureArray(pendingImages).forEach((image) => {
      if (image?.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(image.previewUrl);
      }
    });
    setPendingImages([]);
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
  };

  const clearForm = () => {
    setTitulo('');
    setConteudo('');
    setTurmaPublico('');
    setExpiraEm('');
    clearAudio();
    clearPendingImages();
  };

  const resetFormularioForm = () => {
    setFormularioForm({
      titulo: '',
      descricao: '',
      turma: '',
      data_entrega: '',
      perguntas: [createEmptyFormQuestion()],
    });
  };

  const handleAddFormQuestion = () => {
    setFormularioForm((prev) => ({
      ...prev,
      perguntas: [...prev.perguntas, createEmptyFormQuestion()],
    }));
  };

  const handleFormQuestionChange = (questionId, field, value) => {
    setFormularioForm((prev) => ({
      ...prev,
      perguntas: prev.perguntas.map((question) => (
        question.id === questionId ? { ...question, [field]: value } : question
      )),
    }));
  };

  const handleFormQuestionTypeChange = (questionId, tipo) => {
    setFormularioForm((prev) => ({
      ...prev,
      perguntas: prev.perguntas.map((question) => (
        question.id === questionId
          ? {
            ...question,
            tipo,
            opcoes: tipo === 'multipla_escolha' ? (question.opcoes?.length >= 2 ? question.opcoes : ['', '']) : ['', ''],
            correta: tipo === 'multipla_escolha' ? question.correta : null,
          }
          : question
      )),
    }));
  };

  const handleFormOptionChange = (questionId, optionIndex, value) => {
    setFormularioForm((prev) => ({
      ...prev,
      perguntas: prev.perguntas.map((question) => {
        if (question.id !== questionId) return question;
        const nextOptions = [...question.opcoes];
        nextOptions[optionIndex] = value;
        return { ...question, opcoes: nextOptions };
      }),
    }));
  };

  const handleSaveFormulario = async () => {
    if (!formularioForm.titulo.trim()) {
      toast({ variant: 'destructive', title: 'Título obrigatório', description: 'Informe o nome do formulário.' });
      return;
    }

    if (!formularioForm.turma) {
      toast({ variant: 'destructive', title: 'Destino obrigatório', description: 'Escolha a turma que vai receber o formulário.' });
      return;
    }

    const perguntasValidas = ensureArray(formularioForm.perguntas)
      .map((question) => ({
        ...question,
        pergunta: String(question?.pergunta || '').trim(),
        opcoes: ensureArray(question?.opcoes).map((item) => String(item || '').trim()),
      }))
      .filter((question) => question.pergunta);

    if (perguntasValidas.length === 0) {
      toast({ variant: 'destructive', title: 'Formulário vazio', description: 'Adicione pelo menos uma questão.' });
      return;
    }

    if (perguntasValidas.some((question) => question.tipo === 'multipla_escolha' && question.opcoes.filter(Boolean).length < 2)) {
      toast({ variant: 'destructive', title: 'Opções incompletas', description: 'Perguntas de marcar precisam de ao menos duas opções.' });
      return;
    }

    setFormularioSaving(true);
    try {
      await saveProfessorAtividade({
        titulo: formularioForm.titulo.trim(),
        descricao: serializeFormularioDescricao(formularioForm.descricao, perguntasValidas),
        data_entrega: formularioForm.data_entrega || null,
        target_mode: formularioForm.turma === ALL_TURMAS_OPTION ? 'todas_turmas' : 'turma',
        turma: formularioForm.turma === ALL_TURMAS_OPTION ? '' : formularioForm.turma,
        livro_id: '',
        aluno_id: '',
        pontos_extras: 0,
      });
      toast({ title: 'Formulário criado', description: 'O formulário já está disponível para os alunos da turma.' });
      setIsFormularioDialogOpen(false);
      resetFormularioForm();
      await loadData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Não foi possível criar o formulário.' });
    } finally {
      setFormularioSaving(false);
    }
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
    let uploadedImages = [];
    let uploadedAudio = null;
    try {
      uploadedImages = pendingImages.length > 0
        ? await Promise.all(
            pendingImages.map(async (image) => {
              const upload = await uploadFileToR2({
                file: image.file,
                escolaId: perfil.escola_id,
                ownerId: perfil.id,
                scope: 'comunicados-imagens',
              });
              return upload.objectKey;
            }),
          )
        : [];

      uploadedAudio = audioFile?.file
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
        imagem_urls: uploadedImages,
        audio_url: uploadedAudio?.objectKey || null,
        audio_duration_seconds: audioFile?.durationSeconds || null,
      };

      const result = await createComunidadePost(payload, { roleHint: profileRoleHint });
      const createdPost = await resolveComunicadoMedia({
        id: result?.postId || crypto.randomUUID(),
        ...payload,
        autor_id: perfil.id,
        autor_nome: perfil.nome || null,
        usuarios_biblioteca: perfil?.nome ? { nome: perfil.nome } : null,
        created_at: new Date().toISOString(),
      });

      setPosts((prev) => [createdPost, ...prev]);
      clearForm();
      toast({ title: 'Comunicado publicado!' });
    } catch (error) {
      const cleanupTargets = [
        ...uploadedImages,
        uploadedAudio?.objectKey,
      ].filter(Boolean);

      await Promise.all(cleanupTargets.map((objectKey) => deleteR2Object(objectKey).catch(() => null)));
      toast({
        variant: 'destructive',
        title: 'Falha ao publicar',
        description: error?.message || 'Nao foi possivel publicar o comunicado.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteComunicado = async () => {
    const post = deleteTarget || null;
    if (!post?.id || !perfil?.id) return;

    setSaving(true);
    try {
      const response = await deleteComunidadePost(post.id, perfil.id, { roleHint: profileRoleHint });
      if (!response?.deleted) {
        throw new Error('Voce so pode apagar comunicados enviados por voce.');
      }

      const cleanupTargets = [
        ...ensureArray(post?.imagem_urls_r2_keys),
        post?.audio_url_r2_key || null,
      ].map((item) => String(item || '').trim()).filter(Boolean);

      if (cleanupTargets.length > 0) {
        await Promise.all(cleanupTargets.map((objectKey) => deleteR2Object(objectKey).catch(() => null)));
      }

      setPosts((current) => current.filter((item) => item?.id !== post.id));
      setDeleteTarget(null);
      toast({ title: 'Comunicado apagado!' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao apagar comunicado',
        description: error?.message || 'Nao foi possivel apagar o comunicado.',
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
        <Card className="overflow-hidden border-emerald-200/70 bg-[linear-gradient(135deg,rgba(236,253,245,0.95),rgba(255,255,255,0.98),rgba(240,253,250,0.95))] dark:border-emerald-900/60 dark:bg-[linear-gradient(135deg,rgba(6,78,59,0.28),rgba(15,23,42,0.92),rgba(5,46,22,0.34))]">
          <CardContent className="grid gap-5 p-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-4">
              <Badge className="w-fit rounded-full bg-emerald-600 px-3 py-1 text-white">
                <Megaphone className="mr-1.5 h-3.5 w-3.5" /> Canal oficial da escola
              </Badge>
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Comunicados em destaque</h2>
                <p className="max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                  Um espaco proprio para avisos da escola, da biblioteca e dos professores. Os alunos acompanham tudo daqui,
                  mas somente a equipe pode publicar novos comunicados.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-[24px] border border-white/70 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-slate-950/40">
                <p className="text-xs uppercase tracking-[0.22em] text-emerald-700/80 dark:text-emerald-300/80">Ativos agora</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{comunicadosVisiveis.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {canPublish && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Novo comunicado</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[calc(94vh-92px)] overflow-y-auto px-8 py-7">
              <div className="grid gap-6 rounded-[26px] border border-primary/10 bg-card/80 p-6 shadow-sm xl:grid-cols-[minmax(0,1.15fr)_380px]">
                <div className="space-y-2">
                  <Label>Titulo</Label>
                  <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Aviso sobre a prova de leitura" />
                </div>
                <div className="space-y-2">
                  <Label>Destino</Label>
                  <Select
                    value={turmaPublico || 'none'}
                    onValueChange={(value) => setTurmaPublico(value === 'none' ? '' : value)}
                  >
                    <SelectTrigger className="h-12 rounded-2xl border-emerald-200/70 bg-white/80 text-left shadow-sm transition focus:ring-2 focus:ring-emerald-500/20 dark:border-emerald-900/50 dark:bg-slate-950/40">
                      <SelectValue placeholder="Selecione o destino" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-emerald-200/70 bg-white/95 shadow-[0_18px_40px_rgba(16,24,40,0.16)] backdrop-blur dark:border-emerald-900/50 dark:bg-slate-950/95">
                      <SelectItem value="none">Selecione a turma</SelectItem>
                      <SelectItem value={ALL_TURMAS_OPTION}>Todas as turmas</SelectItem>
                      {turmasPublicacao.map((turma) => (
                        <SelectItem key={turma} value={turma}>{turma}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
                <div className="space-y-2">
                  <Label>Mensagem</Label>
                  <Textarea className="min-h-[180px] rounded-[24px] border-primary/15 bg-background px-5 py-4 text-base shadow-sm"
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

              <div className="rounded-[28px] border border-emerald-200/80 bg-emerald-50/70 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <Label className="flex items-center gap-2 text-base text-emerald-900 dark:text-emerald-100">
                      <AudioLines className="h-4 w-4" /> Audio do comunicado
                    </Label>
                    <p className="text-sm text-emerald-800/80 dark:text-emerald-100/75">
                      Grave com o microfone ou escolha um arquivo ja salvo no aparelho.
                    </p>
                  </div>
                  <input
                    ref={audioInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => {
                      handleSelectAudioFile(e.target.files);
                      e.target.value = '';
                    }}
                  />
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      handleSelectImages(e.target.files);
                      e.target.value = '';
                    }}
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
                      {audioFile ? 'Trocar audio' : 'Adicionar audio'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full"
                      onClick={() => imageInputRef.current?.click()}
                      disabled={pendingImages.length >= 4}
                    >
                      <ImagePlus className="mr-2 h-4 w-4" />
                      Adicionar imagens
                    </Button>
                  </div>
                </div>

                {isRecording ? (
                  <div className="record-status-enter mt-4 rounded-2xl border border-rose-200 bg-white/85 px-4 py-3 text-sm text-rose-700 shadow-[0_12px_24px_rgba(244,63,94,0.08)] dark:border-rose-900/60 dark:bg-slate-950/60 dark:text-rose-200">
                    <div className="grid gap-3 md:grid-cols-[56px_minmax(0,1fr)]">
                      <span className="inline-flex h-2.5 w-2.5 rounded-full bg-rose-500 animate-pulse" />
                      <span className="font-medium">Gravando agora: {formatRecordingClock(recordingSeconds)}</span>
                    </div>
                    <div className="mt-3 flex items-end gap-1 overflow-hidden rounded-full bg-rose-50 px-3 py-2 dark:bg-rose-950/25">
                      {recordingLevels.map((level, index) => (
                        <span
                          key={`recording-bar-${index}`}
                          className="recording-frequency-bar"
                          style={{
                            height: `${0.55 + level * 3.1}rem`,
                            opacity: `${0.28 + level * 0.72}`,
                            transform: `scaleY(${0.82 + level * 0.52}) translateY(${(1 - level) * 1.6}px)`,
                            borderRadius: `${0.55 + level * 0.7}rem`,
                          }}
                        />
                      ))}
                    </div>
                    <p className="mt-1 text-rose-700/80 dark:text-rose-200/80">
                      O aplicativo/navegador pode pedir permissao do microfone nesta etapa.
                    </p>
                  </div>
                ) : null}

                {audioFile ? (
                  <div className="mt-4 space-y-3">
                    <AudioMessagePlayer
                      src={audioFile.previewUrl}
                      title="Previa do audio"
                      durationSeconds={audioFile.durationSeconds}
                    />
                    <div className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3 text-sm dark:bg-slate-950/45">
                      <span className="truncate font-medium text-slate-700 dark:text-slate-200">Audio pronto para envio</span>
                      <Button type="button" variant="ghost" size="sm" onClick={clearAudio}>
                        <X className="mr-1 h-3.5 w-3.5" /> Remover
                      </Button>
                    </div>
                  </div>
                ) : null}

                {pendingImages.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Imagens anexadas</p>
                      <Button type="button" variant="ghost" size="sm" onClick={clearPendingImages}>
                        <X className="mr-1 h-3.5 w-3.5" /> Limpar imagens
                      </Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {pendingImages.map((image, index) => (
                        <div
                          key={image.id}
                          className="group relative overflow-hidden rounded-[24px] border border-emerald-100 bg-white shadow-sm dark:border-white/10 dark:bg-slate-950/45"
                        >
                          <img
                            src={image.previewUrl}
                            alt={`Imagem do comunicado ${index + 1}`}
                            className="h-40 w-full cursor-zoom-in object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                            onClick={() => openImagePreview(image.previewUrl, `Imagem do comunicado ${index + 1}`)}
                          />
                          <div className="absolute right-2 top-2 flex gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              className="h-9 w-9 rounded-full bg-white/92 shadow-sm backdrop-blur"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDownloadPendingImage(image);
                              }}
                              aria-label={`Baixar imagem ${index + 1}`}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              className="h-9 w-9 rounded-full bg-white/92 shadow-sm backdrop-blur"
                              onClick={(event) => {
                                event.stopPropagation();
                                removePendingImage(image.id);
                              }}
                              aria-label={`Remover imagem ${index + 1}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
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

        {isProfessor && (
          <Card>
            <CardHeader className="gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="grid gap-3 md:grid-cols-[56px_minmax(0,1fr)]">
                  <FileQuestion className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">{repairMojibakeText('Formulários enviados')}</CardTitle>
                </div>
                <Button
                  type="button"
                  className="rounded-2xl"
                  onClick={() => {
                    resetFormularioForm();
                    setIsFormularioDialogOpen(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {repairMojibakeText('Adicionar formulário')}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {repairMojibakeText('Esta área acompanha os formulários reais que você publicou para os alunos, dentro do fluxo de comunicados.')}
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{repairMojibakeText('Carregando formulários...')}</p>
              ) : formulariosProfessor.length === 0 ? (
                <div className="rounded-[28px] border border-dashed p-8 text-center">
                  <FileQuestion className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{repairMojibakeText('Nenhum formulário publicado por você no momento.')}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {formulariosProfessor.map((atividade) => (
                    <div key={atividade.id} className="rounded-[30px] border border-border/70 bg-card/95 p-5 shadow-sm">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                              {repairMojibakeText(atividade.titulo || 'Formulário sem título')}
                            </p>
                            <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                              {atividade.meta.perguntas.length} {repairMojibakeText('questões')}
                            </Badge>
                            <Badge variant="outline">
                              {atividade.respostas.length} respostas
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{getAtividadeTargetSummary(atividade)}</p>
                          <p className="text-sm text-muted-foreground">
                            {atividade.livros?.titulo || 'Sem livro vinculado'} â€¢ entrega em {formatDateLabel(atividade.data_entrega)}
                          </p>
                          {atividade.meta.descricaoLimpa ? (
                            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">
                              {atividade.meta.descricaoLimpa}
                            </p>
                          ) : null}
                        </div>
                        <div className="shrink-0 rounded-2xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                          <p>Publicado em {formatDateTimeBR(atividade.created_at)}</p>
                          <p className="mt-1">
                            {atividade.respostas.filter((item) => item.status === 'aprovada').length} aprovadas
                          </p>
                          <div className="mt-3">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-xl"
                              onClick={() => setSelectedFormulario(atividade)}
                            >
                              Ver respostas
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                          <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{post.titulo || 'Novo comunicado'}</p>
                          <Badge variant="destructive">Comunicado</Badge>
                          <Badge variant="outline">
                            <Users className="mr-1 h-3.5 w-3.5" />
                            {post.turma_publico || 'Todas as turmas'}
                          </Badge>
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{post.conteudo || 'Sem mensagem adicional.'}</p>
                      </div>
                      <div className="shrink-0 rounded-2xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <CalendarClock className="h-3.5 w-3.5" />
                          {formatDateTimeBR(post.created_at)}
                        </div>
                        {post.expires_at ? <p className="mt-1">Sai em {formatDateTimeBR(post.expires_at)}</p> : null}
                        {canPublish && String(post?.autor_id || '').trim() === String(perfil?.id || '').trim() ? (
                          <div className="mt-3 flex justify-end">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-xl text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(post)}
                              disabled={saving}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Apagar
                            </Button>
                          </div>
                        ) : null}
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
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {ensureArray(post.imagem_urls).slice(0, 4).map((img, index) => (
                          <div key={`${post.id}-${index}`} className="group relative overflow-hidden rounded-[24px] border">
                            <img
                              src={img}
                              alt={`Imagem ${index + 1}`}
                              className="h-44 w-full cursor-zoom-in object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                              onClick={() => openImagePreview(img, post?.titulo || `Imagem ${index + 1}`)}
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              className="absolute right-2 top-2 h-9 w-9 rounded-full bg-white/92 shadow-sm backdrop-blur"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDownloadPublishedImage(post, index);
                              }}
                              aria-label={`Baixar imagem ${index + 1}`}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
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

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && !saving && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar comunicado?</AlertDialogTitle>
            <AlertDialogDescription>
              Este comunicado sera removido do mural e os anexos relacionados tambem serao apagados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-2xl border bg-muted/30 p-4 text-sm">
            <p className="font-medium">{deleteTarget?.titulo || 'Novo comunicado'}</p>
            <p className="mt-2 text-muted-foreground">{deleteTarget?.conteudo || 'Sem mensagem adicional.'}</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteComunicado}
              disabled={saving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving ? 'Apagando...' : 'Apagar comunicado'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={imagePreviewOpen} onOpenChange={setImagePreviewOpen}>
        <DialogContent className="max-w-5xl overflow-hidden border-emerald-100 bg-white/95 p-4 sm:p-6 dark:border-white/10 dark:bg-slate-950/95">
          <DialogHeader className="border-b border-border/60 bg-gradient-to-r from-primary/8 via-background to-emerald-500/8 px-8 py-6">
            <DialogTitle>{selectedImagePreview.title || 'Visualizacao da imagem'}</DialogTitle>
          </DialogHeader>
          <div className="overflow-hidden rounded-[28px] border border-emerald-100 bg-emerald-50/40 dark:border-white/10 dark:bg-slate-900/70">
            {selectedImagePreview.src ? (
              <img
                src={selectedImagePreview.src}
                alt={selectedImagePreview.title || 'Visualizacao da imagem'}
                className="max-h-[78vh] w-full object-contain"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isFormularioDialogOpen} onOpenChange={setIsFormularioDialogOpen}>
        <DialogContent className="flex h-[min(92vh,960px)] w-[min(96vw,1240px)] max-w-none flex-col overflow-hidden rounded-[28px] border border-primary/10 bg-background p-0 shadow-[0_28px_120px_rgba(15,23,42,0.28)]">
          <DialogHeader className="border-b border-border/60 bg-gradient-to-r from-primary/8 via-background to-emerald-500/8 px-8 py-6">
            <DialogTitle className="text-2xl font-semibold tracking-tight">{repairMojibakeText('Novo formulário')}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-8 py-7">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
              <div className="rounded-[26px] border border-primary/10 bg-card/80 p-6 shadow-sm">
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="space-y-3 lg:col-span-2">
                    <Label className="text-sm font-medium text-foreground/85">{repairMojibakeText('Título')}</Label>
                    <Input
                      className="h-14 rounded-2xl border-primary/15 bg-background px-5 text-base shadow-sm"
                      value={formularioForm.titulo}
                      onChange={(e) => setFormularioForm((prev) => ({ ...prev, titulo: e.target.value }))}
                      placeholder={repairMojibakeText('Ex.: Reflexão sobre o capítulo 3')}
                    />
                  </div>

                  <div className="space-y-3">
                    <Label className="text-sm font-medium text-foreground/85">{repairMojibakeText('Destino')}</Label>
                    <Select
                      value={formularioForm.turma || 'none'}
                      onValueChange={(value) => setFormularioForm((prev) => ({ ...prev, turma: value === 'none' ? '' : value }))}
                    >
                      <SelectTrigger className="h-14 rounded-2xl border-primary/20 bg-muted/20 px-5 text-left text-base shadow-sm transition focus:ring-2 focus:ring-primary/20">
                        <SelectValue placeholder={repairMojibakeText('Selecione a turma')} />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl border-primary/20 bg-background/95 shadow-[0_18px_40px_rgba(16,24,40,0.16)] backdrop-blur">
                        <SelectItem value="none">{repairMojibakeText('Selecione a turma')}</SelectItem>
                        <SelectItem value={ALL_TURMAS_OPTION}>{repairMojibakeText('Todas as turmas')}</SelectItem>
                        {turmasPublicacao.map((turma) => (
                          <SelectItem key={turma} value={turma}>{turma}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-sm font-medium text-foreground/85">{repairMojibakeText('Prazo')}</Label>
                    <Input
                      className="h-14 rounded-2xl border-primary/15 bg-background px-5 text-base shadow-sm"
                      type="date"
                      value={formularioForm.data_entrega}
                      onChange={(e) => setFormularioForm((prev) => ({ ...prev, data_entrega: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-3 lg:col-span-2">
                    <Label className="text-sm font-medium text-foreground/85">{repairMojibakeText('Orientação')}</Label>
                    <Textarea
                      className="min-h-[180px] rounded-[24px] border-primary/15 bg-background px-5 py-4 text-base shadow-sm"
                      rows={6}
                      value={formularioForm.descricao}
                      onChange={(e) => setFormularioForm((prev) => ({ ...prev, descricao: e.target.value }))}
                      placeholder={repairMojibakeText('Explique com clareza o objetivo do formulário, o que o aluno precisa responder e como ele deve preencher.')}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-6 pb-4">
                {formularioForm.perguntas.map((question, index) => (
                  <div
                    key={question.id}
                    className="rounded-[28px] border border-primary/10 bg-card/85 p-7 shadow-[0_12px_40px_rgba(15,23,42,0.06)]"
                  >
                    <div className="flex flex-col gap-5">
                      <div className="flex flex-col gap-3 border-b border-border/60 pb-5 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">{repairMojibakeText(`Questão ${index + 1}`)}</p>
                          <p className="mt-1 text-lg font-semibold text-foreground">{repairMojibakeText('Configure o enunciado e o tipo de resposta')}</p>
                        </div>
                        {formularioForm.perguntas.length > 1 ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 rounded-2xl border-destructive/20 px-5 text-destructive hover:bg-destructive/10"
                            onClick={() => setFormularioForm((prev) => ({
                              ...prev,
                              perguntas: prev.perguntas.filter((item) => item.id !== question.id),
                            }))}
                          >
                            {repairMojibakeText('Remover questão')}
                          </Button>
                        ) : null}
                      </div>

                      <div className="space-y-3">
                        <Label className="text-sm font-medium text-foreground/85">{repairMojibakeText('Pergunta')}</Label>
                        <Input
                          className="h-14 rounded-2xl border-primary/15 bg-background px-5 text-base shadow-sm"
                          value={question.pergunta}
                          onChange={(e) => handleFormQuestionChange(question.id, 'pergunta', e.target.value)}
                          placeholder={repairMojibakeText('Digite a pergunta')}
                        />
                      </div>

                      <div className="space-y-4">
                        <Label className="text-sm font-medium text-foreground/85">{repairMojibakeText('Tipo')}</Label>
                        <div className="grid gap-4 lg:grid-cols-2">
                          <Button
                            type="button"
                            variant={question.tipo === 'texto' ? 'default' : 'outline'}
                            className="h-14 rounded-2xl text-base"
                            onClick={() => handleFormQuestionTypeChange(question.id, 'texto')}
                          >
                            {repairMojibakeText('Resposta aberta')}
                          </Button>
                          <Button
                            type="button"
                            variant={question.tipo === 'multipla_escolha' ? 'default' : 'outline'}
                            className="h-14 rounded-2xl text-base"
                            onClick={() => handleFormQuestionTypeChange(question.id, 'multipla_escolha')}
                          >
                            {repairMojibakeText('Múltipla escolha')}
                          </Button>
                        </div>
                      </div>

                      {question.tipo === 'multipla_escolha' ? (
                        <div className="rounded-[24px] border border-border/70 bg-background/70 p-5">
                          <p className="mb-4 text-sm font-semibold text-foreground">{repairMojibakeText('Alternativas')}</p>
                          <div className="space-y-4">
                            {question.opcoes.map((option, optionIndex) => (
                              <div key={`${question.id}-${optionIndex}`} className="grid gap-3 md:grid-cols-[56px_minmax(0,1fr)]">
                                <Button
                                  type="button"
                                  variant={question.correta === optionIndex ? 'default' : 'outline'}
                                  className="h-14 rounded-2xl"
                                  onClick={() => handleFormQuestionChange(question.id, 'correta', optionIndex)}
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                </Button>
                                <Input
                                  className="h-14 rounded-2xl border-primary/15 bg-background px-5 text-base shadow-sm"
                                  value={option}
                                  onChange={(e) => handleFormOptionChange(question.id, optionIndex, e.target.value)}
                                  placeholder={repairMojibakeText(`Opção ${optionIndex + 1}`)}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-[24px] border border-dashed border-border bg-muted/15 p-5 text-sm leading-6 text-muted-foreground">
                          {repairMojibakeText('O aluno responderá livremente. Use a orientação do formulário para contextualizar a resposta esperada.')}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                <div className="flex justify-start">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-14 w-full rounded-2xl border-dashed text-base sm:w-auto sm:px-6"
                    onClick={handleAddFormQuestion}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {repairMojibakeText('Adicionar questão')}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-border/60 bg-background/95 px-8 py-5 shadow-[0_-18px_48px_rgba(15,23,42,0.14)] backdrop-blur">
            <Button
              type="button"
              variant="outline"
              className="h-12 rounded-2xl px-6"
              onClick={() => setIsFormularioDialogOpen(false)}
            >
              {repairMojibakeText('Cancelar')}
            </Button>
            <Button
              type="button"
              className="h-12 rounded-2xl bg-emerald-600 px-7 text-white shadow-[0_14px_32px_rgba(22,163,74,0.28)] hover:bg-emerald-700"
              onClick={handleSaveFormulario}
              disabled={formularioSaving}
            >
              {formularioSaving ? repairMojibakeText('Publicando...') : repairMojibakeText('Publicar formulário')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedFormulario)} onOpenChange={(open) => !open && setSelectedFormulario(null)}>
        <DialogContent className="max-w-5xl overflow-hidden rounded-[28px] border border-primary/10 bg-background p-0">
          <DialogHeader className="border-b border-border/60 bg-gradient-to-r from-primary/8 via-background to-emerald-500/8 px-8 py-6">
            <DialogTitle className="text-2xl font-semibold tracking-tight">{repairMojibakeText('Respostas do formulário')}</DialogTitle>
          </DialogHeader>

          {selectedFormulario ? (
            <div className="max-h-[82vh] overflow-y-auto px-8 py-7">
              <div className="space-y-5">
                <div className="rounded-[24px] border border-primary/10 bg-card/80 p-5 shadow-sm">
                  <p className="text-lg font-semibold">{repairMojibakeText(selectedFormulario.titulo || 'Formulário')}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedFormulario.respostas.length} resposta(s) recebida(s)
                  </p>
                </div>

                {selectedFormulario.respostas.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground">
                    {repairMojibakeText('Nenhum aluno respondeu este formulário ainda.')}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {selectedFormulario.respostas.map((entrega) => {
                      const payload = parseEntregaPayload(entrega?.texto_entrega);
                      return (
                        <div key={entrega.id} className="rounded-[24px] border border-primary/10 bg-card/80 p-5 shadow-sm">
                          <div>
                            <p className="font-medium">{entrega.usuarios_biblioteca?.nome || 'Aluno'}</p>
                            <p className="text-sm text-muted-foreground">
                              {entrega.usuarios_biblioteca?.turma || '-'} • {formatDateTimeBR(entrega.enviado_em || entrega.updated_at)}
                            </p>
                          </div>

                          <div className="mt-4 space-y-3">
                            {selectedFormulario.meta.perguntas.map((pergunta, idx) => {
                              const answerKey = pergunta.id || `q_${idx + 1}`;
                              return (
                                <div key={`${entrega.id}-${answerKey}`} className="rounded-xl bg-muted/30 p-3">
                                  <p className="text-sm font-medium">{repairMojibakeText(pergunta.pergunta || `Questão ${idx + 1}`)}</p>
                                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                                    {String(payload.respostas?.[answerKey] || 'Sem resposta')}
                                  </p>
                                </div>
                              );
                            })}

                            {payload.texto ? (
                              <div className="rounded-xl bg-muted/30 p-3">
                                <p className="text-sm font-medium">{repairMojibakeText('Texto complementar')}</p>
                                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{payload.texto}</p>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}




