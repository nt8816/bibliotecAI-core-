import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileStack, ImagePlus, Send, Trash2, X } from 'lucide-react';

import { MainLayout } from '@/components/layout/MainLayout';
import { AttachmentList, ChannelFab, ChannelTopBar, ComposerSheet, FeedCardShell, FeedSkeleton, formatBytes, formatRelativeTime, getFileExtension } from '@/components/community/ChannelUI';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { deleteR2Object, getR2DownloadUrl, uploadFileToR2 } from '@/lib/r2Storage';
import { fetchSchoolConfiguration } from '@/services/schoolConfigService';
import {
  createArquivosAulaPost,
  deleteArquivosAulaPost,
  fetchArquivosAulaData,
} from '@/services/arquivosAulaService';
const ALL_TURMAS_OPTION = '__all_turmas__';
const ACCEPTED_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg', 'ppt', 'pptx'];
const ACCEPTED_INPUT = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.ppt,.pptx';

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeText(value, fallback = '-') {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function getAuthorName(post) {
  const snapshotName = safeText(post?.autor_nome, '').trim();
  if (snapshotName) return snapshotName;
  const nested = post?.usuarios_biblioteca;
  if (Array.isArray(nested)) {
    return safeText(nested[0]?.nome, '').trim();
  }
  return safeText(nested?.nome, '').trim();
}

function normalizeTurmaKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDateBR(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleDateString('pt-BR');
  } catch {
    return '-';
  }
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName || 'arquivo';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadFromUrl(url, fileName = 'arquivo') {
  if (!url) return;
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName || 'arquivo';
  link.target = '_blank';
  link.rel = 'noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export default function ArquivosAula() {
  const { user, isProfessor, isGestor } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef(null);
  const profileRoleHint = isProfessor ? 'professor' : isGestor ? 'gestor' : '';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [perfilId, setPerfilId] = useState(null);
  const [escolaId, setEscolaId] = useState(null);
  const [alunoTurma, setAlunoTurma] = useState(null);
  const [turmasPublicacao, setTurmasPublicacao] = useState([]);
  const [professoresPermitidos, setProfessoresPermitidos] = useState([]);
  const [mensagem, setMensagem] = useState('');
  const [turmaPublico, setTurmaPublico] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [posts, setPosts] = useState([]);
  const [professorFilter, setProfessorFilter] = useState('all');
  const [deletePostTarget, setDeletePostTarget] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const canManageArquivos = (isProfessor || isGestor) && enabled;
  const turmaSelecionavel = turmaPublico || (isGestor ? ALL_TURMAS_OPTION : '');
  const canPublishArquivos = canManageArquivos && Boolean(mensagem.trim()) && selectedFiles.length > 0 && Boolean(turmaSelecionavel);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      const [data, schoolConfig] = await Promise.all([
        fetchArquivosAulaData({ roleHint: profileRoleHint }),
        isGestor ? fetchSchoolConfiguration().catch(() => ({ escola: null, salas: [] })) : Promise.resolve({ escola: null, salas: [] }),
      ]);
      const turmasVindasDoModulo = ensureArray(data?.turmasPublicacao || data?.professorTurmas);
      const turmasVindasDaEscola = ensureArray(schoolConfig?.salas)
        .map((item) => safeText(item?.nome, '').trim())
        .filter(Boolean);
      const turmasUnificadas = [...new Set([...turmasVindasDoModulo, ...turmasVindasDaEscola])].sort((a, b) => a.localeCompare(b, 'pt-BR'));

      setEnabled(data?.enabled !== false);
      setPerfilId(data?.perfilId || null);
      setEscolaId(data?.escolaId || null);
      setAlunoTurma(data?.alunoTurma || null);
      setTurmasPublicacao(turmasUnificadas);
      setProfessoresPermitidos(ensureArray(data?.professoresPermitidos));
      setPosts(ensureArray(data?.posts));
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro em Arquivos Didáticos',
        description: error?.message || 'Não foi possível carregar os arquivos didáticos.',
      });
    } finally {
      setLoading(false);
    }
  }, [isGestor, profileRoleHint, toast, user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!isGestor) return;
    if (turmaPublico) return;
    setTurmaPublico(ALL_TURMAS_OPTION);
  }, [isGestor, turmaPublico]);

  const professoresDisponiveis = useMemo(
    () =>
      [...new Set(
        [...ensureArray(professoresPermitidos), ...ensureArray(posts)
          .map((item) => getAuthorName(item))
          .filter(Boolean)],
      )].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [posts, professoresPermitidos],
  );

  const visiblePosts = useMemo(() => {
    let list = ensureArray(posts);
    if (!isProfessor && !isGestor) {
      const turmaAluno = normalizeTurmaKey(alunoTurma);
      list = list.filter((item) => {
        const turmaPost = normalizeTurmaKey(item?.turma_publico);
        return !turmaPost || turmaPost === turmaAluno;
      });
    }
    if (professorFilter !== 'all') {
      list = list.filter((item) => getAuthorName(item) === professorFilter);
    }
    return list;
  }, [alunoTurma, isGestor, isProfessor, posts, professorFilter]);

  const handleSelectFiles = (files) => {
    const incoming = Array.from(files || []);
    if (incoming.length === 0) return;

    const invalid = incoming.find((file) => !ACCEPTED_EXTENSIONS.includes(getFileExtension(file.name)));
    if (invalid) {
      toast({
        variant: 'destructive',
        title: 'Formato nao suportado',
        description: 'Use PDF, Word, Excel, PNG, JPG/JPEG ou PowerPoint.',
      });
      return;
    }

    setSelectedFiles((prev) => {
      const knownKeys = new Set(prev.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
      const dedupedIncoming = incoming.filter((file) => !knownKeys.has(`${file.name}-${file.size}-${file.lastModified}`));
      return [...prev, ...dedupedIncoming];
    });
  };

  const handlePublish = async () => {
    if (!isProfessor && !isGestor) return;
    if (!enabled || !perfilId || !escolaId) {
      toast({
        variant: 'destructive',
        title: 'Arquivos Didáticos indisponível',
        description: 'Não foi possível publicar agora.',
      });
      return;
    }
    if (!mensagem.trim()) {
      toast({
        variant: 'destructive',
        title: 'Mensagem obrigatoria',
        description: 'Escreva uma mensagem para acompanhar os arquivos.',
      });
      return;
    }
    if (selectedFiles.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Adicione arquivos',
        description: 'Selecione ao menos um arquivo para publicar.',
      });
      return;
    }
    if (!turmaSelecionavel.trim()) {
      toast({
        variant: 'destructive',
        title: 'Selecione a turma',
        description: 'Escolha uma turma especifica ou Todas as turmas.',
      });
      return;
    }

    setSaving(true);
    const uploadedObjectKeys = [];
    try {
      const arquivos = [];
      for (const file of selectedFiles) {
        const upload = await uploadFileToR2({
          file,
          escolaId,
          ownerId: perfilId,
          scope: 'arquivos-aula',
        });
        arquivos.push({
          nome: file.name,
          path: upload.objectKey,
          object_key: upload.objectKey,
          provider: upload.provider,
          public_url: upload.publicUrl,
          tamanho: file.size,
          mime_type: file.type || null,
          extensao: getFileExtension(file.name),
        });
        uploadedObjectKeys.push(upload.objectKey);
      }

      const payload = {
        turma_publico: turmaSelecionavel === ALL_TURMAS_OPTION ? null : turmaSelecionavel,
        mensagem: mensagem.trim(),
        arquivos,
      };

      await createArquivosAulaPost(payload, { roleHint: profileRoleHint });

      setMensagem('');
      setTurmaPublico('');
      setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      toast({ title: 'Arquivos publicados!' });
      fetchData();
    } catch (error) {
      await Promise.all(uploadedObjectKeys.map((objectKey) => deleteR2Object(objectKey).catch(() => null)));
      toast({
        variant: 'destructive',
        title: 'Erro ao publicar',
        description: error?.message || 'Não foi possível publicar os arquivos.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async (arquivo) => {
    const path = safeText(arquivo?.object_key || arquivo?.path, '');
    if (!path) return;

    try {
      if (String(arquivo?.provider || '').toLowerCase() === 'r2' || String(path).startsWith('escolas/')) {
        const downloadUrl = await getR2DownloadUrl(path, safeText(arquivo?.nome, 'arquivo'));
        downloadFromUrl(downloadUrl, safeText(arquivo?.nome, 'arquivo'));
        return;
      }

      if (String(arquivo?.public_url || '').trim()) {
        downloadFromUrl(String(arquivo.public_url), safeText(arquivo?.nome, 'arquivo'));
        return;
      }
      throw new Error('Arquivo sem rota de download suportada.');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro no download',
        description: error?.message || 'Não foi possível baixar o arquivo.',
      });
    }
  };

  const handleDeletePost = async () => {
    const post = deletePostTarget || null;
    if ((!isProfessor && !isGestor) || !perfilId || !post?.id || post?.autor_id !== perfilId) return;

    setSaving(true);
    try {
      const arquivosAtuais = ensureArray(post?.arquivos);
      for (const arquivo of arquivosAtuais) {
        const filePath = safeText(arquivo?.object_key || arquivo?.path, '');
        if (!filePath) continue;
        if (String(arquivo?.provider || '').toLowerCase() === 'r2' || String(filePath).startsWith('escolas/')) {
          await deleteR2Object(filePath);
        }
      }

      await deleteArquivosAulaPost(post.id, { roleHint: profileRoleHint });
      setPosts((prev) => ensureArray(prev).filter((item) => item.id !== post.id));
      setDeletePostTarget(null);
      toast({ title: 'Publicacao excluida!' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir publicacao',
        description: error?.message || 'Não foi possível excluir a publicacao.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <MainLayout title="Arquivos Didáticos">
      <div className="space-y-5 pb-24">
        <ChannelTopBar
          eyebrow={<><FileStack className="mr-1.5 inline h-3.5 w-3.5" /> Material da escola</>}
          title="Arquivos didáticos"
          description="PDFs, imagens e documentos enviados pela equipe. Alunos baixam em um toque; professores e gestão publicam rapidinho."
          meta={
            <div className="rounded-2xl border border-white/60 bg-white/80 px-4 py-2 shadow-sm dark:border-white/10 dark:bg-slate-950/40">
              <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-700/80 dark:text-emerald-300/80">Materiais</p>
              <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{visiblePosts.length}</p>
            </div>
          }
          action={
            canManageArquivos && enabled ? (
              <Button
                type="button"
                className="hidden rounded-2xl bg-emerald-600 px-5 text-white hover:bg-emerald-700 sm:inline-flex"
                onClick={() => setComposerOpen(true)}
              >
                <ImagePlus className="mr-2 h-4 w-4" />
                Enviar material
              </Button>
            ) : (
              <Badge variant="outline" className="rounded-full">Só download</Badge>
            )
          }
        />

        {!enabled ? (
          <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
            Recurso indisponível no banco atual. Aplique a migration de Arquivos Didáticos.
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full sm:max-w-xs space-y-2">
            <Label className="text-xs text-muted-foreground">Filtrar por autor</Label>
            <select
              value={professorFilter}
              onChange={(e) => setProfessorFilter(e.target.value)}
              className="flex h-11 w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm shadow-sm"
            >
              <option value="all">Todos os autores</option>
              {professoresDisponiveis.map((nome) => (
                <option key={nome} value={nome}>{nome}</option>
              ))}
            </select>
          </div>
          {canManageArquivos ? (
            <p className="text-sm text-muted-foreground">Toque em enviar para publicar material da aula.</p>
          ) : null}
        </div>

        {loading ? (
          <FeedSkeleton count={3} />
        ) : visiblePosts.length === 0 ? (
          <div className="rounded-[28px] border border-dashed p-10 text-center">
            <FileStack className="mx-auto mb-3 h-8 w-8 text-emerald-600" />
            <p className="font-medium text-slate-900 dark:text-slate-100">Nenhum material publicado</p>
            <p className="mt-1 text-sm text-muted-foreground">Quando a equipe enviar arquivos, eles aparecem aqui.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {visiblePosts.map((post) => (
              <FeedCardShell
                key={post.id}
                author={safeText(getAuthorName(post), 'Autor')}
                timeLabel={formatRelativeTime(post?.created_at) || formatDateBR(post?.created_at)}
                turmaLabel={post?.turma_publico ? `Turma ${post.turma_publico}` : 'Todas as turmas'}
                actions={
                  (isProfessor || isGestor) && post?.autor_id === perfilId ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="rounded-xl text-destructive hover:text-destructive"
                      onClick={() => setDeletePostTarget(post)}
                      disabled={saving}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      Excluir
                    </Button>
                  ) : null
                }
              >
                <p className="whitespace-pre-wrap text-[15px] leading-7 text-slate-700 dark:text-slate-200">
                  {safeText(post?.mensagem, 'Material da aula disponível para download.')}
                </p>
                <AttachmentList
                  items={ensureArray(post?.arquivos).map((arquivo) => ({
                    ...arquivo,
                    extensao: arquivo?.extensao || getFileExtension(arquivo?.nome),
                  }))}
                  title="Arquivos da aula"
                  onDownload={(arquivo) => handleDownload(arquivo)}
                />
              </FeedCardShell>
            ))}
          </div>
        )}
      </div>

      <ChannelFab
        visible={canManageArquivos && enabled}
        label="Enviar material"
        icon={<ImagePlus className="h-5 w-5" />}
        onClick={() => setComposerOpen(true)}
      />

      {canManageArquivos && enabled ? (
        <ComposerSheet
          open={composerOpen}
          onOpenChange={setComposerOpen}
          title="Enviar material"
          description="Escolha a turma, descreva o material e anexe os arquivos da aula."
          submitLabel={saving ? 'Enviando...' : 'Publicar material'}
          submitting={saving}
          submitDisabled={!canPublishArquivos}
          onSubmit={handlePublish}
        >
          {isGestor ? (
            <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/70 px-4 py-3 text-sm dark:border-emerald-900/50 dark:bg-emerald-950/20">
              Acesso total do gestor: pode publicar para qualquer turma ou todas de uma vez.
            </div>
          ) : turmasPublicacao.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma turma liberada para o seu perfil. Peça ao gestor para liberar suas turmas.
            </p>
          ) : null}

          <div className="space-y-2">
            <Label>Turma</Label>
            <select
              value={turmaPublico || (isGestor ? ALL_TURMAS_OPTION : 'none')}
              onChange={(e) => setTurmaPublico(e.target.value === 'none' ? '' : e.target.value)}
              className="flex h-12 w-full rounded-2xl border border-emerald-200/70 bg-background px-4 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none dark:border-emerald-900/50"
              disabled={!canManageArquivos || saving}
            >
              {!isGestor && <option value="none">Selecione a turma</option>}
              <option value={ALL_TURMAS_OPTION}>Todas as turmas</option>
              {turmasPublicacao.map((turma) => (
                <option key={turma} value={turma}>{turma}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>Mensagem</Label>
            <Textarea
              rows={4}
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder="Descreva o material da aula..."
              className="rounded-2xl"
            />
          </div>

          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_INPUT}
              className="hidden"
              onChange={(e) => handleSelectFiles(e.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={!canManageArquivos || saving}
              className="rounded-2xl"
            >
              <ImagePlus className="mr-2 h-4 w-4" />
              Adicionar arquivos
            </Button>
            <p className="text-xs text-muted-foreground">
              Formatos aceitos: PDF, Word, Excel, PNG, JPG/JPEG e PowerPoint.
            </p>
            {selectedFiles.length > 0 ? (
              <AttachmentList
                items={selectedFiles.map((file) => ({ nome: file.name, tamanho: file.size, extensao: getFileExtension(file.name) }))}
                title="Na fila"
              />
            ) : null}
          </div>
        </ComposerSheet>
      ) : null}

      <AlertDialog open={Boolean(deletePostTarget)} onOpenChange={(open) => !open && setDeletePostTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir publicacao?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta publicacao sera removida permanentemente, junto com todos os arquivos anexados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePost} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir publicacao
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
