import { useEffect, useRef, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { buscarCapaLivro } from '@/services/capasOpenLibraryService';

export function CapaLivro({ livro }) {
  const containerRef = useRef(null);
  const [visivel, setVisivel] = useState(false);
  const [capa, setCapa] = useState(null);
  const [erro, setErro] = useState(false);
  const { titulo, autor, editora, ano, capa_url: capaExistente } = livro;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setVisivel(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisivel(true);
        observer.disconnect();
      }
    }, { rootMargin: '200px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let ativo = true;
    setErro(false);
    setCapa(capaExistente || null);
    if (visivel && !capaExistente) {
      buscarCapaLivro({ titulo, autor, editora, ano }).then((url) => {
        if (ativo) setCapa(url);
      }).catch(() => {});
    }
    return () => { ativo = false; };
  }, [visivel, titulo, autor, editora, ano, capaExistente]);

  return (
    <div ref={containerRef} className="flex h-36 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/50">
      {capa && !erro ? (
        <img src={capa} alt={`Capa de ${titulo}`} loading="lazy" className="h-full w-full object-contain" onError={() => setErro(true)} />
      ) : (
        <BookOpen aria-label="Capa indisponível" role="img" className="h-10 w-10 text-muted-foreground/50" />
      )}
    </div>
  );
}
