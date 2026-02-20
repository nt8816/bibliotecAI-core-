import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AudioLines, Filter, Heart, ImagePlus, MessageSquare, Plus, Send, Sparkles, X } from 'lucide-react';

import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

const ENABLE_OPTIONAL_STUDENT_FEATURES = import.meta.env.VITE_ENABLE_OPTIONAL_STUDENT_FEATURES !== 'false';

function formatDateBR(dateValue) {
  if (!dateValue) return '-';
  try {
    return format(new Date(dateValue), 'dd/MM/yyyy', { locale: ptBR });
  } catch {
    return '-';
  }
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeText(value, fallback = '-') {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function safeNestedName(value, fallback = 'Usuário') {
  if (!value) return fallback;
  if (Array.isArray(value)) {
    const first = value[0];
    return safeText(first?.nome, fallback);
  }
  return safeText(value?.nome, fallback);
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

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ComunidadeAluno() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [alunoId, setAlunoId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [livros, setLivros] = useState([]);
  const [audiobooks, setAudiobooks] = useState([]);
  const [posts, setPosts] = useState([]);
  const [likes, setLikes] = useState([]);
  const [enabled, setEnabled] = useState(ENABLE_OPTIONAL_STUDENT_FEATURES);

  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState('todos');

  const [postTipo, setPostTipo] = useState('resenha');
  const [postLivroId, setPostLivroId] = useState('');
  const [postAudiobookId, setPostAudiobookId] = useState('');
  const [postTitulo, setPostTitulo] = useState('');
  const [postConteudo, setPostConteudo] = useState('');
  const [postComIA, setPostComIA] = useState(false);
  const [imageDataUrls, setImageDataUrls] = useState([]);
  const [selectedImageUrl, setSelectedImageUrl] = useState('');
  const [rankingEscolas, setRankingEscolas] = useState([]);

  const fetchData = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data: perfil, error: perfilError } = await supabase
        .from('usuarios_biblioteca')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (perfilError || !perfil) throw perfilError || new Error('Perfil do aluno não encontrado.');
      setAlunoId(perfil.id);

      const { data: livrosData, error: livrosError } = await supabase.from('livros').select('id, titulo').order('titulo');
      if (livrosError) throw livrosError;
      setLivros(livrosData || []);

      if (!enabled) {
        setPosts([]);
        setLikes([]);
        setAudiobooks([]);
        setRankingEscolas([]);
        return;
      }

      const probeRes = await supabase.from('comunidade_posts').select('id').limit(1);
      if (probeRes.error) {
        if (isMissingTableError(probeRes.error)) {
          setEnabled(false);
          setPosts([]);
          setLikes([]);
          setAudiobooks([]);
          setRankingEscolas([]);
          return;
        }
        throw probeRes.error;
      }

      const [postsRes, likesRes, audioRes, usuariosRes, leiturasRes] = await Promise.all([
        supabase
          .from('comunidade_posts')
          .select('*, livros(titulo), audiobooks_biblioteca(titulo, autor, audio_url), usuarios_biblioteca!comunidade_posts_autor_id_fkey(nome)')
          .order('created_at', { ascending: false })
          .limit(80),
        supabase.from('comunidade_curtidas').select('post_id, usuario_id'),
        supabase.from('audiobooks_biblioteca').select('id, titulo, autor').order('titulo'),
        supabase.from('usuarios_biblioteca').select('id, escola_id, escolas(nome)').not('escola_id', 'is', null),
        supabase.from('emprestimos').select('usuario_id').eq('status', 'devolvido'),
      ]);

      const maybeError = [postsRes.error, likesRes.error].find(Boolean);
      if (maybeError) throw maybeError;
      if (audioRes.error && !isMissingTableError(audioRes.error)) throw audioRes.error;

      setPosts(postsRes.data || []);
      setLikes(likesRes.data || []);
      setAudiobooks(audioRes.error ? [] : audioRes.data || []);

      if (!usuariosRes.error && !leiturasRes.error) {
        const escolaPorUsuario = new Map(
          ensureArray(usuariosRes.data).map((u) => [
            u.id,
            {
              escolaId: u.escola_id,
              escolaNome: safeText(u?.escolas?.nome, 'Escola'),
            },
          ]),
        );

        const acumulado = new Map();
        ensureArray(leiturasRes.data).forEach((registro) => {
          const escola = escolaPorUsuario.get(registro.usuario_id);
          if (!escola?.escolaId) return;
          const key = escola.escolaId;
          const atual = acumulado.get(key) || { escolaId: key, escolaNome: escola.escolaNome, leituras: 0 };
          atual.leituras += 1;
          acumulado.set(key, atual);
        });

        setRankingEscolas(
          Array.from(acumulado.values())
            .sort((a, b) => b.leituras - a.leituras)
            .slice(0, 10),
        );
      } else {
        setRankingEscolas([]);
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro na comunidade',
        description: error?.message || 'Não foi possível carregar a comunidade.',
      });
    } finally {
      setLoading(false);
    }
  }, [enabled, toast, user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRealtimeChange = useCallback(() => {
    fetchData();
  }, [fetchData]);

  useRealtimeSubscription({ table: enabled ? 'comunidade_posts' : null, onChange: onRealtimeChange });
  useRealtimeSubscription({ table: enabled ? 'comunidade_curtidas' : null, onChange: onRealtimeChange });

  const likedPostIds = useMemo(() => {
    if (!alunoId) return new Set();
    return new Set(ensureArray(likes).filter((l) => l?.usuario_id === alunoId).map((l) => l?.post_id).filter(Boolean));
  }, [alunoId, likes]);

  const likesByPost = useMemo(() => {
    const map = new Map();
    ensureArray(likes).forEach((l) => {
      if (!l?.post_id) return;
      map.set(l.post_id, (map.get(l.post_id) || 0) + 1);
    });
    return map;
  }, [likes]);

  const postsFiltrados = useMemo(() => {
    if (filtroTipo === 'todos') return ensureArray(posts);
    if (filtroTipo === 'ia') return ensureArray(posts).filter((post) => ensureArray(post?.tags).includes('ia'));
    return ensureArray(posts).filter((post) => post?.tipo === filtroTipo);
  }, [filtroTipo, posts]);

  const handleSelectImages = async (files) => {
    const selected = Array.from(files || []).slice(0, 4);
    if (selected.length === 0) return;

    try {
      const converted = await Promise.all(selected.map(fileToDataUrl));
      setImageDataUrls((prev) => [...prev, ...converted].slice(0, 4));
    } catch {
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível processar as imagens.' });
    }
  };

  const clearPostForm = () => {
    setPostTipo('resenha');
    setPostLivroId('');
    setPostAudiobookId('');
    setPostTitulo('');
    setPostConteudo('');
    setPostComIA(false);
    setImageDataUrls([]);
  };

  const handleCriarPost = async () => {
    if (!enabled || !alunoId) return;
    if (!postConteudo.trim() && imageDataUrls.length === 0 && !postAudiobookId) {
      toast({
        variant: 'destructive',
        title: 'Preencha o conteúdo',
        description: 'Adicione texto, imagem ou audiobook para publicar.',
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('comunidade_posts').insert({
        autor_id: alunoId,
        livro_id: postLivroId || null,
        audiobook_id: postAudiobookId || null,
        tipo: postTipo,
        titulo: postTitulo.trim() || null,
        conteudo: postConteudo.trim() || 'Compartilhamento de mídia criado na comunidade.',
        imagem_urls: imageDataUrls,
        tags: postComIA ? ['ia'] : [],
      });

      if (error) throw error;

      clearPostForm();
      setPostDialogOpen(false);
      toast({ title: 'Publicação criada!' });
      await fetchData();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: isMissingTableError(error)
          ? 'Comunidade indisponível: aplique a migration do banco.'
          : error?.message || 'Falha ao publicar.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCompartilharPost = async (post) => {
    const textoCompartilhamento = `${safeText(post?.titulo, 'Post da comunidade')} - ${safeText(post?.conteudo, '')}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: safeText(post?.titulo, 'Comunidade de leitura'),
          text: textoCompartilhamento,
        });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(textoCompartilhamento);
        toast({ title: 'Texto copiado', description: 'Conteúdo copiado para compartilhar.' });
      } else {
        throw new Error('Compartilhamento indisponível neste dispositivo.');
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível compartilhar este conteúdo.' });
      }
    }
  };

  const toggleLikePost = async (postId) => {
    if (!enabled || !alunoId) return;

    try {
      if (likedPostIds.has(postId)) {
        const { error } = await supabase.from('comunidade_curtidas').delete().eq('post_id', postId).eq('usuario_id', alunoId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('comunidade_curtidas').insert({ post_id: postId, usuario_id: alunoId });
        if (error) throw error;
      }
      await fetchData();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: isMissingTableError(error)
          ? 'Comunidade indisponível: aplique a migration do banco.'
          : error?.message || 'Falha ao curtir/descurtir.',
      });
    }
  };

  return (
    <MainLayout title="Comunidade do Aluno">
      <div className="space-y-4 sm:space-y-6 pb-20">
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-info/10 to-warning/10 p-4 sm:p-6">
          <div className="absolute right-4 top-4 opacity-30">
            <Sparkles className="w-10 h-10" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold">Comunidade de Leitura</h2>
          <p className="text-sm text-muted-foreground mt-1">Compartilhe resenhas, dicas, sugestões e recomendações de audiobooks.</p>
        </div>

        {!enabled && (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">
                Comunidade indisponível neste ambiente. Para habilitar, ative `VITE_ENABLE_OPTIONAL_STUDENT_FEATURES=true`,
                aplique a migration e recarregue.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <Badge variant="outline" className="gap-1 shrink-0">
            <Filter className="w-3 h-3" /> Filtrar
          </Badge>
          <Button size="sm" variant={filtroTipo === 'todos' ? 'default' : 'outline'} onClick={() => setFiltroTipo('todos')}>
            Todos
          </Button>
          <Button size="sm" variant={filtroTipo === 'resenha' ? 'default' : 'outline'} onClick={() => setFiltroTipo('resenha')}>
            Resenhas
          </Button>
          <Button size="sm" variant={filtroTipo === 'dica' ? 'default' : 'outline'} onClick={() => setFiltroTipo('dica')}>
            Dicas
          </Button>
          <Button size="sm" variant={filtroTipo === 'sugestao' ? 'default' : 'outline'} onClick={() => setFiltroTipo('sugestao')}>
            Sugestões
          </Button>
          <Button size="sm" variant={filtroTipo === 'ia' ? 'default' : 'outline'} onClick={() => setFiltroTipo('ia')}>
            Com IA
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ranking da escola em leituras</CardTitle>
          </CardHeader>
          <CardContent>
            {rankingEscolas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados de ranking por enquanto.</p>
            ) : (
              <div className="space-y-2">
                {rankingEscolas.map((item, index) => (
                  <div key={item.escolaId} className="flex items-center justify-between rounded-lg border p-3">
                    <p className="text-sm font-medium">
                      {index + 1}. {item.escolaNome}
                    </p>
                    <Badge>{item.leituras} leituras</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Feed da comunidade</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Carregando...</p>
            ) : postsFiltrados.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Sem posts para este filtro.</p>
            ) : (
              <div className="space-y-4">
                {postsFiltrados.map((post) => (
                  <div key={post.id} className="p-4 rounded-xl border bg-card shadow-sm space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-sm sm:text-base">{safeText(post?.titulo, 'Post da comunidade')}</p>
                          {ensureArray(post?.tags).includes('ia') && <Badge variant="secondary">IA</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {safeNestedName(post?.usuarios_biblioteca, 'Usuário')} • {safeText(post?.tipo, 'resenha')} • {formatDateBR(post?.created_at)}
                        </p>
                      </div>
                      <Badge variant="secondary">{safeText(post?.livros?.titulo, 'Geral')}</Badge>
                    </div>

                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{safeText(post?.conteudo, 'Conteúdo indisponível')}</p>

                    {ensureArray(post?.imagem_urls).length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {ensureArray(post?.imagem_urls).slice(0, 4).map((img, index) => (
                          <button key={`${post.id}-${index}`} type="button" onClick={() => setSelectedImageUrl(img)} className="text-left">
                            <img src={img} alt={`Imagem ${index + 1}`} className="w-full h-40 sm:h-52 object-cover rounded-md border" />
                          </button>
                        ))}
                      </div>
                    )}

                    {post?.audiobooks_biblioteca && (
                      <div className="p-2 rounded-md bg-muted/70 text-xs space-y-2">
                        <p>
                          <span className="font-medium">Audiobook indicado:</span> {safeText(post?.audiobooks_biblioteca?.titulo, '-')}
                        </p>
                        {post?.audiobooks_biblioteca?.audio_url && (
                          <audio controls src={post.audiobooks_biblioteca.audio_url} className="w-full h-10" preload="metadata" />
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => toggleLikePost(post.id)} disabled={!enabled}>
                        <Heart className={`w-4 h-4 mr-1 ${likedPostIds.has(post.id) ? 'fill-destructive text-destructive' : ''}`} />
                        {likesByPost.get(post.id) || 0}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleCompartilharPost(post)} disabled={!enabled}>
                        Compartilhar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Button
        type="button"
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg"
        onClick={() => setPostDialogOpen(true)}
        disabled={!enabled}
      >
        <Plus className="w-6 h-6" />
      </Button>

      <Dialog open={postDialogOpen} onOpenChange={setPostDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> Nova publicação
            </DialogTitle>
            <DialogDescription>Compartilhe uma resenha, dica ou sugestão com a comunidade.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <select
                  value={postTipo}
                  onChange={(e) => setPostTipo(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="resenha">Resenha</option>
                  <option value="dica">Dica</option>
                  <option value="sugestao">Sugestão</option>
                </select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Livro da biblioteca (opcional)</Label>
                <select
                  value={postLivroId || 'none'}
                  onChange={(e) => setPostLivroId(e.target.value === 'none' ? '' : e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="none">Sem livro específico</option>
                  {livros.map((livro) => (
                    <option key={livro.id} value={livro.id}>
                      {livro.titulo}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Audiobook da biblioteca (opcional)</Label>
              <select
                value={postAudiobookId || 'none'}
                onChange={(e) => setPostAudiobookId(e.target.value === 'none' ? '' : e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="none">Não indicar audiobook</option>
                {audiobooks.map((audio) => (
                  <option key={audio.id} value={audio.id}>
                    {audio.titulo} {audio.autor ? `- ${audio.autor}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={postTitulo} onChange={(e) => setPostTitulo(e.target.value)} placeholder="Título da publicação" />
            </div>

            <div className="space-y-2">
              <Label>Conteúdo</Label>
              <Textarea
                rows={4}
                value={postConteudo}
                onChange={(e) => setPostConteudo(e.target.value)}
                placeholder="Escreva sua experiência de leitura..."
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={postComIA}
                onChange={(e) => setPostComIA(e.target.checked)}
                className="h-4 w-4 rounded border border-input"
              />
              Conteúdo criado com IA
            </label>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <ImagePlus className="w-4 h-4" /> Imagens (até 4)
              </Label>
              <Input type="file" accept="image/*" multiple onChange={(e) => handleSelectImages(e.target.files)} />
              {imageDataUrls.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {imageDataUrls.map((img, index) => (
                    <div key={index} className="relative">
                      <img src={img} alt={`Preview ${index + 1}`} className="w-full h-20 object-cover rounded-md border" />
                      <button
                        type="button"
                        onClick={() => setImageDataUrls((prev) => prev.filter((_, i) => i !== index))}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPostDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCriarPost} disabled={saving || !enabled}>
                <Send className="w-4 h-4 mr-2" /> {saving ? 'Publicando...' : 'Publicar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedImageUrl)} onOpenChange={(open) => !open && setSelectedImageUrl('')}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Visualização da imagem</DialogTitle>
          </DialogHeader>
          {selectedImageUrl && (
            <img src={selectedImageUrl} alt="Imagem ampliada" className="w-full max-h-[75vh] object-contain rounded-lg border" />
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
