import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { fetchRecomendacaoLivros, proximaRecomendacaoLivros, salvarPreferenciasLivros } from '@/services/recomendacaoLivrosService';

export function RecomendacaoLivros({ titulo = 'Recomendado para você', onSelecionar }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [generos, setGeneros] = useState([]);
  const { toast } = useToast();

  const carregar = useCallback(async () => {
    setOcupado(true);
    setErro(false);
    try {
      const resposta = await fetchRecomendacaoLivros();
      setDados(resposta);
      if (resposta.precisa_preferencias) setDialogAberto(true);
    } catch {
      setErro(true);
    } finally {
      setOcupado(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const proximo = async () => {
    setOcupado(true);
    try {
      const resposta = await proximaRecomendacaoLivros();
      setDados(resposta);
      if (resposta.precisa_preferencias) setDialogAberto(true);
    } catch (error) {
      if (error.status === 429) setDados((atual) => ({ ...atual, restantes_hoje: 0 }));
      else toast({ variant: 'destructive', title: 'Não foi possível gerar a sugestão', description: error.message });
    } finally {
      setOcupado(false);
    }
  };

  const salvar = async () => {
    setOcupado(true);
    try {
      await salvarPreferenciasLivros(generos);
      setDialogAberto(false);
      await carregar();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Não foi possível salvar seus gostos', description: error.message });
    } finally {
      setOcupado(false);
    }
  };

  const principal = dados?.principal;
  const restantes = dados?.restantes_hoje;
  return (
    <>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-primary" />{titulo}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {erro ? <div><p>Não foi possível gerar a sugestão</p><Button variant="outline" size="sm" onClick={carregar}>Tentar de novo</Button></div> : !dados ? <p className="text-sm text-muted-foreground">Carregando sugestão...</p> : principal ? (
            <div className="space-y-2">
              {principal.area && <Badge variant="outline">{principal.area}</Badge>}
              {onSelecionar ? <button type="button" className="block text-left font-semibold text-primary hover:underline" onClick={() => onSelecionar(principal)}>{principal.titulo}</button> : <p className="font-semibold">{principal.titulo}</p>}
              {principal.autor && <p className="text-sm text-muted-foreground">{principal.autor}</p>}
              {principal.sinopse && <p className="text-sm">{principal.sinopse}</p>}
              {principal.motivo && <p className="text-sm text-muted-foreground">{principal.motivo}</p>}
              {onSelecionar && <Button type="button" size="sm" onClick={() => onSelecionar(principal)}>Pedir emprestado</Button>}
            </div>
          ) : <p className="text-sm text-muted-foreground">Ainda não há livros para sugerir</p>}
          {dados && <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={proximo} disabled={ocupado || restantes === 0 || dados.sem_alternativas || !principal}><RefreshCw className="mr-1 h-3 w-3" />Sugerir outro</Button>
            {dados.sem_alternativas && <span className="text-xs text-muted-foreground">Não há mais sugestões disponíveis hoje.</span>}
            {typeof restantes === 'number' && <span className="text-xs text-muted-foreground">{restantes === 0 ? 'Volte amanhã' : `${restantes} de 3 hoje`}</span>}
            <Button size="sm" variant="ghost" onClick={() => setDialogAberto(true)}>Ajustar gostos</Button>
          </div>}
        </CardContent>
      </Card>
      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent>
          <DialogHeader><DialogTitle>Quais gêneros você gosta?</DialogTitle><DialogDescription>Escolha de 1 a 3 gêneros para personalizar suas sugestões.</DialogDescription></DialogHeader>
          <div className="flex flex-wrap gap-2">{(dados?.generos_catalogo || []).map((genero) => <Button key={genero} type="button" size="sm" variant={generos.includes(genero) ? 'default' : 'outline'} aria-pressed={generos.includes(genero)} disabled={ocupado || (!generos.includes(genero) && generos.length >= 3)} onClick={() => setGeneros((atual) => atual.includes(genero) ? atual.filter((item) => item !== genero) : [...atual, genero])}>{genero}</Button>)}</div>
          <Button onClick={salvar} disabled={ocupado || generos.length < 1}>Salvar e ver sugestão</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
