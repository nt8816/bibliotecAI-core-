import { useEffect, useState, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { BookOpen, Heart, Star, History, Send, Volume2, VolumeX, Sparkles, Search, Clock, BookMarked, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Livro {
  id: string;
  titulo: string;
  autor: string;
  area: string;
  sinopse: string | null;
  disponivel: boolean;
  editora: string | null;
  ano: string | null;
}

interface Avaliacao {
  id: string;
  livro_id: string;
  nota: number;
  resenha: string | null;
  created_at: string;
  livros?: { titulo: string; autor: string };
}

export default function PainelAluno() {
  const [livros, setLivros] = useState<Livro[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [emprestimos, setEmprestimos] = useState<any[]>([]);
  const [sugestoes, setSugestoes] = useState<any[]>([]);
  const [solicitacoes, setSolicitacoes] = useState<any[]>([]);
  const [alunoId, setAlunoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [recomendacoes, setRecomendacoes] = useState<Livro[]>([]);
  const [preferencias, setPreferencias] = useState<any>(null);
  const [showQuestionario, setShowQuestionario] = useState(false);

  // Review dialog
  const [reviewDialog, setReviewDialog] = useState(false);
  const [reviewLivro, setReviewLivro] = useState<Livro | null>(null);
  const [reviewNota, setReviewNota] = useState(5);
  const [reviewTexto, setReviewTexto] = useState('');
  const [saving, setSaving] = useState(false);

  // Loan request
  const [requestDialog, setRequestDialog] = useState(false);
  const [requestLivro, setRequestLivro] = useState<Livro | null>(null);
  const [requestMsg, setRequestMsg] = useState('');

  // TTS
  const [speaking, setSpeaking] = useState(false);

  // Questionário
  const [qGeneros, setQGeneros] = useState<string[]>([]);
  const [qAutores, setQAutores] = useState('');
  const [qUltimos, setQUltimos] = useState('');
  const [qNivel, setQNivel] = useState('intermediario');
  const [qFrequencia, setQFrequencia] = useState('semanal');

  const { user } = useAuth();
  const { toast } = useToast();

  useRealtimeSubscription({ table: 'avaliacoes_livros' as any, onChange: () => fetchData() });
  useRealtimeSubscription({ table: 'lista_desejos' as any, onChange: () => fetchData() });
  useRealtimeSubscription({ table: 'solicitacoes_emprestimo' as any, onChange: () => fetchData() });

  useEffect(() => { fetchData(); }, [user]);

  const fetchData = async () => {
    if (!user) return;
    try {
      // Get aluno profile
      const { data: perfil } = await supabase.from('usuarios_biblioteca').select('id').eq('user_id', user.id).single();
      if (!perfil) return;
      setAlunoId(perfil.id);

      const [livrosRes, avaliacoesRes, wishlistRes, emprestimosRes, sugestoesRes, solicitacoesRes, prefsRes] = await Promise.all([
        supabase.from('livros').select('*').order('titulo'),
        supabase.from('avaliacoes_livros').select('*, livros(titulo, autor)').eq('usuario_id', perfil.id).order('created_at', { ascending: false }),
        supabase.from('lista_desejos').select('livro_id').eq('usuario_id', perfil.id),
        supabase.from('emprestimos').select('*, livros(titulo, autor)').eq('usuario_id', perfil.id).order('data_emprestimo', { ascending: false }),
        supabase.from('sugestoes_livros').select('*, livros(titulo, autor)').eq('aluno_id', perfil.id).order('created_at', { ascending: false }),
        supabase.from('solicitacoes_emprestimo').select('*, livros(titulo, autor)').eq('usuario_id', perfil.id).order('created_at', { ascending: false }),
        supabase.from('preferencias_aluno').select('*').eq('usuario_id', perfil.id).maybeSingle(),
      ]);

      setLivros(livrosRes.data || []);
      setAvaliacoes(avaliacoesRes.data || []);
      setWishlist((wishlistRes.data || []).map((w: any) => w.livro_id));
      setEmprestimos(emprestimosRes.data || []);
      setSugestoes(sugestoesRes.data || []);
      setSolicitacoes(solicitacoesRes.data || []);
      setPreferencias(prefsRes.data);

      if (!prefsRes.data) {
        setShowQuestionario(true);
      } else {
        // Generate recommendations based on preferences
        const allBooks = livrosRes.data || [];
        const prefs = prefsRes.data;
        const favoriteAreas = prefs.generos_favoritos || [];
        const recs = allBooks
          .filter((l: Livro) => l.disponivel)
          .filter((l: Livro) => favoriteAreas.length === 0 || favoriteAreas.some((g: string) => l.area.toLowerCase().includes(g.toLowerCase())))
          .slice(0, 8);
        setRecomendacoes(recs.length > 0 ? recs : allBooks.filter((l: Livro) => l.disponivel).slice(0, 8));
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveQuestionario = async () => {
    if (!alunoId) return;
    setSaving(true);
    try {
      const data = {
        usuario_id: alunoId,
        generos_favoritos: qGeneros,
        autores_favoritos: qAutores.split(',').map(s => s.trim()).filter(Boolean),
        ultimos_livros: qUltimos.split(',').map(s => s.trim()).filter(Boolean),
        nivel_leitura: qNivel,
        frequencia_leitura: qFrequencia,
      };
      const { error } = await supabase.from('preferencias_aluno').upsert(data, { onConflict: 'usuario_id' });
      if (error) throw error;
      toast({ title: 'Preferências salvas!', description: 'Suas recomendações serão personalizadas.' });
      setShowQuestionario(false);
      fetchData();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message });
    } finally { setSaving(false); }
  };

  const toggleWishlist = async (livroId: string) => {
    if (!alunoId) return;
    if (wishlist.includes(livroId)) {
      await supabase.from('lista_desejos').delete().eq('livro_id', livroId).eq('usuario_id', alunoId);
      setWishlist(prev => prev.filter(id => id !== livroId));
      toast({ title: 'Removido da lista de desejos' });
    } else {
      await supabase.from('lista_desejos').insert({ livro_id: livroId, usuario_id: alunoId });
      setWishlist(prev => [...prev, livroId]);
      toast({ title: 'Adicionado à lista de desejos!' });
    }
  };

  const handleSaveReview = async () => {
    if (!alunoId || !reviewLivro) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('avaliacoes_livros').upsert({
        livro_id: reviewLivro.id, usuario_id: alunoId, nota: reviewNota, resenha: reviewTexto || null,
      }, { onConflict: 'livro_id,usuario_id' });
      if (error) throw error;
      toast({ title: 'Avaliação salva!' });
      setReviewDialog(false);
      setReviewTexto('');
      fetchData();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message });
    } finally { setSaving(false); }
  };

  const handleRequestLoan = async () => {
    if (!alunoId || !requestLivro) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('solicitacoes_emprestimo').insert({
        livro_id: requestLivro.id, usuario_id: alunoId, mensagem: requestMsg || null,
      });
      if (error) throw error;
      toast({ title: 'Solicitação enviada!', description: 'Aguarde a aprovação da biblioteca.' });
      setRequestDialog(false);
      setRequestMsg('');
      fetchData();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message });
    } finally { setSaving(false); }
  };

  const speakText = (text: string) => {
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 0.9;
    utterance.onend = () => setSpeaking(false);
    setSpeaking(true);
    speechSynthesis.speak(utterance);
  };

  const generoOptions = ['Ficção', 'Romance', 'Ciência', 'História', 'Poesia', 'Aventura', 'Biografia', 'Fantasia', 'Suspense', 'Autoajuda', 'Educação', 'Infantil', 'HQ/Mangá', 'Religião'];

  const filteredLivros = livros.filter(l =>
    l.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.autor.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.area.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const novidades = [...livros].sort((a, b) => b.titulo.localeCompare(a.titulo)).slice(0, 10);

  const renderStars = (nota: number, onClick?: (n: number) => void) => (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} onClick={() => onClick?.(n)} className={onClick ? 'cursor-pointer' : 'cursor-default'}>
          <Star className={`w-4 h-4 ${n <= nota ? 'fill-warning text-warning' : 'text-muted-foreground'}`} />
        </button>
      ))}
    </div>
  );

  if (loading) return <MainLayout title="Meu Painel"><p className="text-center text-muted-foreground py-8">Carregando...</p></MainLayout>;

  return (
    <MainLayout title="Meu Painel">
      {/* Questionário de primeiro acesso */}
      <Dialog open={showQuestionario} onOpenChange={setShowQuestionario}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5" /> Bem-vindo! Conte-nos sobre você</DialogTitle>
            <DialogDescription>Responda para recebermos recomendações personalizadas.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Gêneros favoritos (selecione vários)</Label>
              <div className="flex flex-wrap gap-2">
                {generoOptions.map(g => (
                  <Badge key={g} variant={qGeneros.includes(g) ? 'default' : 'outline'}
                    className="cursor-pointer" onClick={() => setQGeneros(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])}>
                    {g}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Autores favoritos (separados por vírgula)</Label>
              <Input value={qAutores} onChange={e => setQAutores(e.target.value)} placeholder="Ex: Machado de Assis, J.K. Rowling" />
            </div>
            <div className="space-y-2">
              <Label>Últimos livros lidos (separados por vírgula)</Label>
              <Input value={qUltimos} onChange={e => setQUltimos(e.target.value)} placeholder="Ex: Dom Casmurro, Harry Potter" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nível de leitura</Label>
                <Select value={qNivel} onValueChange={setQNivel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="iniciante">Iniciante</SelectItem>
                    <SelectItem value="intermediario">Intermediário</SelectItem>
                    <SelectItem value="avancado">Avançado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Frequência de leitura</Label>
                <Select value={qFrequencia} onValueChange={setQFrequencia}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="diaria">Diária</SelectItem>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="mensal">Mensal</SelectItem>
                    <SelectItem value="raramente">Raramente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowQuestionario(false)}>Pular</Button>
            <Button onClick={handleSaveQuestionario} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><BookMarked className="w-5 h-5 text-primary" /></div><div><p className="text-xs text-muted-foreground">Empréstimos</p><p className="text-xl font-bold">{emprestimos.length}</p></div></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center"><Star className="w-5 h-5 text-warning" /></div><div><p className="text-xs text-muted-foreground">Avaliações</p><p className="text-xl font-bold">{avaliacoes.length}</p></div></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center"><Heart className="w-5 h-5 text-destructive" /></div><div><p className="text-xs text-muted-foreground">Lista de Desejos</p><p className="text-xl font-bold">{wishlist.length}</p></div></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center"><Send className="w-5 h-5 text-info" /></div><div><p className="text-xs text-muted-foreground">Solicitações</p><p className="text-xl font-bold">{solicitacoes.length}</p></div></div></CardContent></Card>
        </div>

        {/* Recomendações */}
        {recomendacoes.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="w-4 h-4" /> Recomendados para Você</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {recomendacoes.map(livro => (
                  <Card key={livro.id} className="p-3 hover:shadow-md transition-shadow">
                    <p className="font-medium text-sm truncate">{livro.titulo}</p>
                    <p className="text-xs text-muted-foreground truncate">{livro.autor}</p>
                    <Badge variant="outline" className="mt-1 text-xs">{livro.area || 'Geral'}</Badge>
                    <div className="flex gap-1 mt-2">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setRequestLivro(livro); setRequestDialog(true); }}>
                        <Send className="w-3 h-3 mr-1" />Pedir
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => toggleWishlist(livro.id)}>
                        <Heart className={`w-3 h-3 ${wishlist.includes(livro.id) ? 'fill-destructive text-destructive' : ''}`} />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="catalogo">
          <TabsList className="flex-wrap">
            <TabsTrigger value="catalogo" className="gap-1"><BookOpen className="w-4 h-4" />Catálogo</TabsTrigger>
            <TabsTrigger value="historico" className="gap-1"><History className="w-4 h-4" />Histórico</TabsTrigger>
            <TabsTrigger value="desejos" className="gap-1"><Heart className="w-4 h-4" />Desejos ({wishlist.length})</TabsTrigger>
            <TabsTrigger value="avaliacoes" className="gap-1"><Star className="w-4 h-4" />Avaliações</TabsTrigger>
            <TabsTrigger value="sugestoes" className="gap-1"><Sparkles className="w-4 h-4" />Sugestões</TabsTrigger>
            <TabsTrigger value="novidades" className="gap-1"><Clock className="w-4 h-4" />Novidades</TabsTrigger>
          </TabsList>

          {/* CATÁLOGO */}
          <TabsContent value="catalogo" className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar livros..." className="pl-9" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredLivros.slice(0, 30).map(livro => (
                <Card key={livro.id} className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{livro.titulo}</p>
                      <p className="text-sm text-muted-foreground">{livro.autor}</p>
                      <div className="flex gap-1 mt-1">
                        <Badge variant="outline" className="text-xs">{livro.area || 'Geral'}</Badge>
                        <Badge variant={livro.disponivel ? 'default' : 'secondary'} className="text-xs">
                          {livro.disponivel ? 'Disponível' : 'Emprestado'}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 ml-2">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => toggleWishlist(livro.id)}>
                        <Heart className={`w-4 h-4 ${wishlist.includes(livro.id) ? 'fill-destructive text-destructive' : ''}`} />
                      </Button>
                    </div>
                  </div>
                  {livro.sinopse && (
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground line-clamp-2">{livro.sinopse}</p>
                      <Button size="sm" variant="ghost" className="h-6 px-1 text-xs mt-1" onClick={() => speakText(livro.sinopse || '')}>
                        {speaking ? <VolumeX className="w-3 h-3 mr-1" /> : <Volume2 className="w-3 h-3 mr-1" />}
                        {speaking ? 'Parar' : 'Ouvir sinopse'}
                      </Button>
                    </div>
                  )}
                  <div className="flex gap-1 mt-2">
                    {livro.disponivel && (
                      <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { setRequestLivro(livro); setRequestDialog(true); }}>
                        <Send className="w-3 h-3 mr-1" />Solicitar
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { setReviewLivro(livro); setReviewNota(5); setReviewTexto(''); setReviewDialog(true); }}>
                      <Star className="w-3 h-3 mr-1" />Avaliar
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* HISTÓRICO */}
          <TabsContent value="historico">
            <Card>
              <CardHeader><CardTitle className="text-base">Meus Empréstimos</CardTitle></CardHeader>
              <CardContent>
                {emprestimos.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nenhum empréstimo encontrado</p>
                ) : (
                  <div className="space-y-3">
                    {emprestimos.map((e: any) => (
                      <div key={e.id} className="flex justify-between items-center p-3 border rounded-lg">
                        <div>
                          <p className="font-medium">{e.livros?.titulo}</p>
                          <p className="text-xs text-muted-foreground">{e.livros?.autor}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(e.data_emprestimo), 'dd/MM/yyyy', { locale: ptBR })} →{' '}
                            {format(new Date(e.data_devolucao_prevista), 'dd/MM/yyyy', { locale: ptBR })}
                          </p>
                        </div>
                        <Badge variant={e.status === 'devolvido' ? 'secondary' : 'default'}>
                          {e.status === 'devolvido' ? 'Devolvido' : 'Ativo'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* DESEJOS */}
          <TabsContent value="desejos">
            <Card>
              <CardHeader><CardTitle className="text-base">Minha Lista de Desejos</CardTitle></CardHeader>
              <CardContent>
                {wishlist.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Sua lista está vazia. Explore o catálogo!</p>
                ) : (
                  <div className="space-y-3">
                    {wishlist.map(livroId => {
                      const livro = livros.find(l => l.id === livroId);
                      if (!livro) return null;
                      return (
                        <div key={livroId} className="flex justify-between items-center p-3 border rounded-lg">
                          <div>
                            <p className="font-medium">{livro.titulo}</p>
                            <p className="text-xs text-muted-foreground">{livro.autor}</p>
                            <Badge variant={livro.disponivel ? 'default' : 'secondary'} className="mt-1 text-xs">
                              {livro.disponivel ? 'Disponível' : 'Emprestado'}
                            </Badge>
                          </div>
                          <div className="flex gap-1">
                            {livro.disponivel && (
                              <Button size="sm" variant="outline" onClick={() => { setRequestLivro(livro); setRequestDialog(true); }}>
                                <Send className="w-3 h-3 mr-1" />Solicitar
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => toggleWishlist(livroId)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* AVALIAÇÕES */}
          <TabsContent value="avaliacoes">
            <Card>
              <CardHeader><CardTitle className="text-base">Minhas Avaliações</CardTitle></CardHeader>
              <CardContent>
                {avaliacoes.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Você ainda não avaliou nenhum livro</p>
                ) : (
                  <div className="space-y-3">
                    {avaliacoes.map(a => (
                      <div key={a.id} className="p-3 border rounded-lg">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{a.livros?.titulo}</p>
                            <p className="text-xs text-muted-foreground">{a.livros?.autor}</p>
                          </div>
                          {renderStars(a.nota)}
                        </div>
                        {a.resenha && <p className="text-sm mt-2 text-muted-foreground">{a.resenha}</p>}
                        <p className="text-xs text-muted-foreground mt-1">{format(new Date(a.created_at), 'dd/MM/yyyy', { locale: ptBR })}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* SUGESTÕES */}
          <TabsContent value="sugestoes">
            <Card>
              <CardHeader><CardTitle className="text-base">Sugestões dos Professores</CardTitle></CardHeader>
              <CardContent>
                {sugestoes.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nenhuma sugestão recebida</p>
                ) : (
                  <div className="space-y-3">
                    {sugestoes.map((s: any) => (
                      <div key={s.id} className="p-3 border rounded-lg">
                        <p className="font-medium">{s.livros?.titulo}</p>
                        <p className="text-xs text-muted-foreground">{s.livros?.autor}</p>
                        {s.mensagem && <p className="text-sm mt-1 text-muted-foreground italic">"{s.mensagem}"</p>}
                        <p className="text-xs text-muted-foreground mt-1">{format(new Date(s.created_at), 'dd/MM/yyyy', { locale: ptBR })}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* NOVIDADES */}
          <TabsContent value="novidades">
            <Card>
              <CardHeader><CardTitle className="text-base">Livros Recém-Adicionados</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {novidades.map(livro => (
                    <div key={livro.id} className="p-3 border rounded-lg flex justify-between items-center">
                      <div>
                        <p className="font-medium">{livro.titulo}</p>
                        <p className="text-xs text-muted-foreground">{livro.autor}</p>
                        <Badge variant={livro.disponivel ? 'default' : 'secondary'} className="mt-1 text-xs">
                          {livro.disponivel ? 'Disponível' : 'Emprestado'}
                        </Badge>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => toggleWishlist(livro.id)}>
                          <Heart className={`w-4 h-4 ${wishlist.includes(livro.id) ? 'fill-destructive text-destructive' : ''}`} />
                        </Button>
                        {livro.disponivel && (
                          <Button size="sm" variant="outline" className="text-xs" onClick={() => { setRequestLivro(livro); setRequestDialog(true); }}>
                            Solicitar
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Review Dialog */}
      <Dialog open={reviewDialog} onOpenChange={setReviewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Avaliar: {reviewLivro?.titulo}</DialogTitle>
            <DialogDescription>Dê sua nota e escreva uma resenha.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nota</Label>
              {renderStars(reviewNota, setReviewNota)}
            </div>
            <div className="space-y-2">
              <Label>Resenha (opcional)</Label>
              <Textarea value={reviewTexto} onChange={e => setReviewTexto(e.target.value)} placeholder="O que achou do livro?" rows={4} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setReviewDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveReview} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Loan Request Dialog */}
      <Dialog open={requestDialog} onOpenChange={setRequestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar Empréstimo</DialogTitle>
            <DialogDescription>Solicitar: {requestLivro?.titulo}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Mensagem (opcional)</Label>
              <Textarea value={requestMsg} onChange={e => setRequestMsg(e.target.value)} placeholder="Motivo ou observações..." rows={3} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRequestDialog(false)}>Cancelar</Button>
            <Button onClick={handleRequestLoan} disabled={saving}>{saving ? 'Enviando...' : 'Enviar Solicitação'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
