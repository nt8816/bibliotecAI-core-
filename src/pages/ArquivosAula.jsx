import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileStack, ImagePlus, Send, Trash2, X } from 'lucide-react';

import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

const STORAGE_BUCKET = 'arquivos-aula';
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

function normalizeTurmaKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isMissingTableError(error) {
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    message.includes('could not find the table') ||
    message.includes('does not exist')
  );
}

function getFileExtension(fileName) {
  const parts = String(fileName || '').split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function sanitizeFileName(fileName) {
  return String(fileName || 'arquivo')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]/g, '_');
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

function getStoragePath({ escolaId, autorId, fileName }) {
  const now = Date.now();
  const safeName = sanitizeFileName(fileName);
  return `${escolaId}/${autorId}/${now}-${safeName}`;
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

export default function ArquivosAula() {
  const { user, isProfessor } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [perfilId, setPerfilId] = useState(null);
  const [escolaId, setEscolaId] = useState(null);
  const [alunoTurma, setAlunoTurma] = useState(null);
  const [professorTurmas, setProfessorTurmas] = useState([]);
  const [mensagem, setMensagem] = useState('');
  const [turmaPublico, setTurmaPublico] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [posts, setPosts] = useState([]);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      const { data: perfil, error: perfilError } = await supabase
        .from('usuarios_biblioteca')
        .select('id, escola_id, turma, tipo')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (perfilError || !perfil) throw perfilError || new Error('Perfil nao encontrado.');

      setPerfilId(perfil.id);
      setEscolaId(perfil.escola_id || null);
      setAlunoTurma(perfil.turma || null);

      if (String(perfil.tipo || '') === 'professor') {
        const { data: turmasData, error: turmasError } = await supabase
          .from('professor_turmas')
          .select('turma')
          .eq('professor_id', perfil.id);
        if (turmasError && !isMissingTableError(turmasError)) throw turmasError;
        setProfessorTurmas(
          [...new Set(ensureArray(turmasData).map((item) => safeText(item?.turma, '').trim()).filter(Boolean))].sort(),
        );
      } else {
        setProfessorTurmas([]);
      }

      const { data, error } = await supabase
        .from('arquivos_aula_posts')
        .select('*, usuarios_biblioteca!arquivos_aula_posts_autor_id_fkey(nome)')
        .order('created_at', { ascending: false });

      if (error) {
        if (isMissingTableError(error)) {
          setEnabled(false);
          setPosts([]);
          return;
        }
        throw error;
      }

      setEnabled(true);
      setPosts(data || []);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro em Arquivos de Aula',
        description: error?.message || 'Nao foi possivel carregar os arquivos de aula.',
      });
    } finally {
      setLoading(false);
    }
  }, [toast, user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const visiblePosts = useMemo(() => {
    let list = ensureArray(posts);
    if (!isProfessor) {
      const turmaAluno = normalizeTurmaKey(alunoTurma);
      list = list.filter((item) => {
        const turmaPost = normalizeTurmaKey(item?.turma_publico);
        return !turmaPost || turmaPost === turmaAluno;
      });
    }
    return list;
  }, [alunoTurma, isProfessor, posts]);

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

    setSelectedFiles((prev) => [...prev, ...incoming]);
  };

  const handlePublish = async () => {
    if (!isProfessor) return;
    if (!enabled || !perfilId || !escolaId) {
      toast({
        variant: 'destructive',
        title: 'Arquivos de Aula indisponivel',
        description: 'Nao foi possivel publicar agora.',
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
    try {
      const arquivos = [];
      for (const file of selectedFiles) {
        const path = getStoragePath({ escolaId, autorId: perfilId, fileName: file.name });
        const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: false });
        if (uploadError) throw uploadError;
        arquivos.push({
          nome: file.name,
          path,
          tamanho: file.size,
          mime_type: file.type || null,
          extensao: getFileExtension(file.name),
        });
      }

      const payload = {
        autor_id: perfilId,
        escola_id: escolaId,
        turma_publico: turmaPublico === ALL_TURMAS_OPTION ? null : turmaPublico,
        mensagem: mensagem.trim(),
        arquivos,
      };

      const { error } = await supabase.from('arquivos_aula_posts').insert(payload);
      if (error) throw error;

      setMensagem('');
      setTurmaPublico('');
      setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      toast({ title: 'Arquivos publicados!' });
      fetchData();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao publicar',
        description: error?.message || 'Nao foi possivel publicar os arquivos.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async (arquivo) => {
    const path = safeText(arquivo?.path, '');
    if (!path) return;

    try {
      const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(path);
      if (error) throw error;
      downloadBlob(data, safeText(arquivo?.nome, 'arquivo'));
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro no download',
        description: error?.message || 'Nao foi possivel baixar o arquivo.',
      });
    }
  };

  const handleDeletePost = async (post) => {
    if (!isProfessor || !perfilId || !post?.id || post?.autor_id !== perfilId) return;
    const confirmed = window.confirm('Deseja excluir esta publicacao e seus arquivos?');
    if (!confirmed) return;

    setSaving(true);
    try {
      const filePaths = ensureArray(post?.arquivos).map((item) => safeText(item?.path, '')).filter(Boolean);
      if (filePaths.length > 0) {
        const { error: storageError } = await supabase.storage.from(STORAGE_BUCKET).remove(filePaths);
        if (storageError) {
          console.warn('Falha ao remover arquivos do storage.', storageError);
        }
      }

      const { error } = await supabase
        .from('arquivos_aula_posts')
        .delete()
        .eq('id', post.id)
        .eq('autor_id', perfilId);

      if (error) throw error;

      setPosts((prev) => ensureArray(prev).filter((item) => item.id !== post.id));
      toast({ title: 'Publicacao excluida!' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir',
        description: error?.message || 'Nao foi possivel excluir a publicacao.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <MainLayout title="Arquivos de Aula">
      <div className="space-y-4 sm:space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <FileStack className="w-5 h-5" />
              Arquivos de Aula
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Professores podem publicar materiais com mensagem. Alunos podem baixar os arquivos disponiveis para sua turma.
            </p>

            {!enabled && (
              <p className="text-sm text-muted-foreground">
                Recurso indisponivel no banco atual. Aplique a migration de Arquivos de Aula.
              </p>
            )}

            {isProfessor && enabled && (
              <div className="space-y-4 rounded-xl border p-4">
                <div className="space-y-2">
                  <Label>Turma</Label>
                  <select
                    value={turmaPublico || 'none'}
                    onChange={(e) => setTurmaPublico(e.target.value === 'none' ? '' : e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="none">Selecione a turma</option>
                    <option value={ALL_TURMAS_OPTION}>Todas as turmas</option>
                    {professorTurmas.map((turma) => (
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
                  <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
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
                  <Button type="button" onClick={handlePublish} disabled={saving}>
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
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Carregando...</p>
            ) : visiblePosts.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhum material publicado ainda.</p>
            ) : (
              <div className="space-y-4">
                {visiblePosts.map((post) => (
                  <div key={post.id} className="rounded-xl border p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{post?.turma_publico ? `Turma ${post.turma_publico}` : 'Todas as turmas'}</Badge>
                        <Badge variant="secondary">{safeText(post?.usuarios_biblioteca?.nome, 'Professor')}</Badge>
                        <span className="text-xs text-muted-foreground">{formatDateBR(post?.created_at)}</span>
                      </div>
                      {isProfessor && post?.autor_id === perfilId && (
                        <Button type="button" size="sm" variant="ghost" onClick={() => handleDeletePost(post)} disabled={saving}>
                          <Trash2 className="w-4 h-4 mr-2 text-destructive" />
                          Excluir
                        </Button>
                      )}
                    </div>
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
                          <Button type="button" size="sm" variant="outline" onClick={() => handleDownload(arquivo)}>
                            <Download className="w-4 h-4 mr-2" />
                            Baixar
                          </Button>
                        </div>
                      ))}
                    </div>
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
