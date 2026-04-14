import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileStack, ImagePlus, Send, Trash2, X } from 'lucide-react';

import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { deleteR2Object, getR2DownloadUrl, uploadFileToR2 } from '@/lib/r2Storage';
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

function getFileExtension(fileName) {
  const parts = String(fileName || '').split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function formatBytes(value) {
  const size = Number(value || 0);
  if (!size) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
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
  const canManageArquivos = (isProfessor || isGestor) && enabled && turmasPublicacao.length > 0;

  const fetchData = useCallback(async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      const data = await fetchArquivosAulaData({ roleHint: profileRoleHint });
      setEnabled(data?.enabled !== false);
      setPerfilId(data?.perfilId || null);
      setEscolaId(data?.escolaId || null);
      setAlunoTurma(data?.alunoTurma || null);
      setTurmasPublicacao(ensureArray(data?.turmasPublicacao || data?.professorTurmas));
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
  }, [profileRoleHint, toast, user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
    if (!turmaPublico.trim()) {
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
        turma_publico: turmaPublico === ALL_TURMAS_OPTION ? null : turmaPublico,
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
      <div className="space-y-4 sm:space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <FileStack className="w-5 h-5" />
              Arquivos Didáticos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Professores e gestores podem publicar materiais com mensagem. Alunos podem baixar os arquivos disponíveis para sua turma.
            </p>

            {!enabled && (
              <p className="text-sm text-muted-foreground">
                Recurso indisponível no banco atual. Aplique a migration de Arquivos Didáticos.
              </p>
            )}

            {(isProfessor || isGestor) && enabled && (
              <div className="space-y-4 rounded-xl border p-4">
                {turmasPublicacao.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma turma disponível para o seu perfil ainda.
                  </p>
                )}
                <div className="space-y-2">
                  <Label>Turma</Label>
                  <select
                    value={turmaPublico || 'none'}
                    onChange={(e) => setTurmaPublico(e.target.value === 'none' ? '' : e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    disabled={!canManageArquivos || saving}
                  >
                    <option value="none">Selecione a turma</option>
                    <option value={ALL_TURMAS_OPTION}>Todas as turmas</option>
                    {turmasPublicacao.map((turma) => (
                      <option key={turma} value={turma}>
                        {turma}
                      </option>
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
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <ImagePlus className="w-4 h-4" />
                    Arquivos anexos
                  </Label>
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
                  >
                    <ImagePlus className="w-4 h-4 mr-2" />
                    Adicionar arquivos
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Formatos aceitos: PDF, Word, Excel, PNG, JPG/JPEG e PowerPoint.
                  </p>
                  {selectedFiles.length > 0 && (
                    <div className="space-y-2">
                      {selectedFiles.map((file, index) => (
                        <div key={`${file.name}-${index}`} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{file.name}</p>
                            <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setSelectedFiles((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button type="button" onClick={handlePublish} disabled={!canManageArquivos || saving}>
                    <Send className="w-4 h-4 mr-2" />
                    {saving ? 'Publicando...' : 'Publicar material'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Materiais publicados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Filtrar por autor</Label>
                <select
                  value={professorFilter}
                  onChange={(e) => setProfessorFilter(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="all">Todos os autores</option>
                  {professoresDisponiveis.map((nome) => (
                    <option key={nome} value={nome}>
                      {nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loading ? (
              <p className="text-center text-muted-foreground py-8">Carregando...</p>
            ) : visiblePosts.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhum material publicado ainda.</p>
            ) : (
              <div className="space-y-4">
                {visiblePosts.map((post) => (
                  <div key={post.id} className="rounded-xl border p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{post?.turma_publico ? `Turma ${post.turma_publico}` : 'Todas as turmas'}</Badge>
                        <span className="text-xs text-muted-foreground">{formatDateBR(post?.created_at)}</span>
                      </div>
                      {(isProfessor || isGestor) && post?.autor_id === perfilId && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeletePostTarget(post)}
                          disabled={saving}
                        >
                          <Trash2 className="w-4 h-4 mr-2 text-destructive" />
                          Excluir publicacao
                        </Button>
                      )}
                    </div>
                    <p className="text-sm font-medium">
                      Publicado por: {safeText(getAuthorName(post), 'Autor não identificado')}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{safeText(post?.mensagem, '')}</p>
                    <div className="space-y-2">
                      {ensureArray(post?.arquivos).map((arquivo, index) => (
                        <div key={`${post.id}-${index}`} className="flex items-center justify-between rounded-md border px-3 py-2 gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{safeText(arquivo?.nome, 'Arquivo')}</p>
                            <p className="text-xs text-muted-foreground">
                              {safeText(arquivo?.extensao, '').toUpperCase() || 'ARQ'} • {formatBytes(arquivo?.tamanho)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button type="button" size="sm" variant="outline" onClick={() => handleDownload(arquivo)}>
                              <Download className="w-4 h-4 mr-2" />
                              Baixar
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
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
      </div>
    </MainLayout>
  );
}
