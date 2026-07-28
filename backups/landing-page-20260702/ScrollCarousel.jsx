import { useState, useRef, useEffect } from 'react';

const IMAGES = [
  { img: '/system-screenshots/s-hero.png', title: 'Dashboard', desc: 'Painel principal com visao geral da biblioteca' },
  { img: '/system-screenshots/s-problema.png', title: 'Problema', desc: 'Os desafios das bibliotecas tradicionais' },
  { img: '/system-screenshots/s-solucao.png', title: 'Catalogo', desc: 'Sistema completo com IA integrada' },
  { img: '/system-screenshots/s-diferenciais.png', title: 'Diferenciais', desc: 'Funcionalidades unicas da plataforma' },
  { img: '/system-screenshots/s-gamificacao.png', title: 'Gamificacao', desc: 'XP, niveis e ranking para engajar alunos' },
  { img: '/system-screenshots/s-como.png', title: 'Como Funciona', desc: '4 passos para comecar' },
  { img: '/system-screenshots/s-resultados.png', title: 'Resultados', desc: 'Metricas reais em operacao' },
  { img: '/system-screenshots/s-tecnologias.png', title: 'Stack', desc: 'Tecnologia moderna e escalavel' },
];

const TOTAL = IMAGES.length;
const CARD_W = 340;
const GAP = 20;

export default function ScrollCarousel() {
  const trackRef = useRef(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onScroll = () => {
      const scrollLeft = track.scrollLeft;
      const idx = Math.round(scrollLeft / (CARD_W + GAP));
      setActive(Math.max(0, Math.min(TOTAL - 1, idx)));
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => track.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (i) => {
    trackRef.current?.scrollTo({ left: i * (CARD_W + GAP), behavior: 'smooth' });
  };

  return (
    <div style={{ padding: '5rem 0 4rem', position: 'relative', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '2rem', padding: '0 2rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.9rem', background: 'rgba(46,125,50,0.06)', border: '1px solid rgba(46,125,50,0.12)', borderRadius: 50, fontSize: '0.75rem', fontWeight: 800, color: '#2E7D32', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem' }}>
          Galeria
        </div>
        <h2 style={{ fontSize: 'clamp(1.8rem, 3vw, 2.5rem)', fontWeight: 900, lineHeight: 1.15, letterSpacing: '-0.02em' }}>
          Veja o sistema em acao
        </h2>
        <p style={{ fontSize: '0.95rem', color: '#4a6a4a', marginTop: '0.5rem' }}>Deslize para explorar cada tela</p>
      </div>

      {/* Track */}
      <div ref={trackRef} style={{ display: 'flex', gap: GAP, overflowX: 'auto', scrollSnapType: 'x mandatory', scrollBehavior: 'smooth', padding: '1rem 2rem', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
        {IMAGES.map((item, i) => (
          <div key={i} onClick={() => scrollTo(i)} style={{ flexShrink: 0, width: CARD_W, scrollSnapAlign: 'center', borderRadius: 14, overflow: 'hidden', background: '#fff', boxShadow: i === active ? '0 12px 40px rgba(46,125,50,0.2)' : '0 4px 16px rgba(0,0,0,0.06)', border: i === active ? '2px solid rgba(46,125,50,0.25)' : '1px solid rgba(0,0,0,0.05)', transition: 'box-shadow 0.3s, border 0.3s', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '0.5rem 0.7rem', background: '#fff', borderBottom: '1px solid rgba(46,125,50,0.08)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <div style={{ width: 22, height: 22, borderRadius: 5, background: 'linear-gradient(135deg, #2E7D32, #43A047)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="11" height="11" viewBox="0 0 256 256" fill="none"><path d="M74 66C74 60.477 78.477 56 84 56H158C172.359 56 184 67.641 184 82V177C184 182.523 179.523 187 174 187H102C86.536 187 74 174.464 74 159V66Z" fill="#fff" fillOpacity="0.94"/><circle cx="170" cy="169" r="27" fill="#fff"/><path d="M158 169h24M170 157v24" stroke="#2E7D32" strokeWidth="8" strokeLinecap="round"/></svg>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: '0.65rem', color: '#1B5E20', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
                <div style={{ fontSize: '0.5rem', color: '#6a8a6a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.desc}</div>
              </div>
            </div>
            <div style={{ height: 220, overflow: 'hidden', padding: '0.2rem', background: '#f8faf8' }}>
              <img src={item.img} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 4 }} draggable={false} />
            </div>
          </div>
        ))}
      </div>

      {/* Dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: '1.2rem' }}>
        {IMAGES.map((_, i) => (
          <button key={i} onClick={() => scrollTo(i)} style={{ width: i === active ? 22 : 7, height: 7, borderRadius: 4, border: 'none', padding: 0, cursor: 'pointer', background: i === active ? '#2E7D32' : i < active ? '#43A047' : '#ddd', transition: 'all 0.3s' }} />
        ))}
      </div>

      {/* Arrow buttons */}
      {active > 0 && (
        <button onClick={() => scrollTo(active - 1)} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', width: 40, height: 40, borderRadius: '50%', border: '2px solid #2E7D32', background: 'rgba(255,255,255,0.9)', color: '#2E7D32', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 700, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10 }}>
          &#8249;
        </button>
      )}
      {active < TOTAL - 1 && (
        <button onClick={() => scrollTo(active + 1)} style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', width: 40, height: 40, borderRadius: '50%', border: '2px solid #2E7D32', background: 'rgba(255,255,255,0.9)', color: '#2E7D32', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 700, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10 }}>
          &#8250;
        </button>
      )}

      <style>{`
        div::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
