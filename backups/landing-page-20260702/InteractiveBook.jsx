import { useState, useRef, useEffect } from 'react';
import { useResponsive } from '../hooks/useBreakpoint';

const PAGES = [
  { id: 'hero', img: '/system-screenshots/s-hero.png', title: 'Dashboard Principal', desc: 'Visao completa da biblioteca com acervo, emprestimos e comunicados.' },
  { id: 'problema', img: '/system-screenshots/s-problema.png', title: 'O Problema', desc: 'A maioria das bibliotecas ainda depende de planilhas e WhatsApp.' },
  { id: 'solucao', img: '/system-screenshots/s-solucao.png', title: 'Catalogo com IA', desc: 'Cadastre livros, a IA busca sinopses e gera resumos automaticamente.' },
  { id: 'diferenciais', img: '/system-screenshots/s-diferenciais.png', title: 'Diferenciais', desc: 'IA nativa, chat, gamificacao e app mobile incluido.' },
  { id: 'gamificacao', img: '/system-screenshots/s-gamificacao.png', title: 'Gamificacao', desc: 'XP, niveis, ranking e desafios diarios.' },
  { id: 'como', img: '/system-screenshots/s-como.png', title: 'Como Funciona', desc: '4 passos simples: cadastre, importe, convide e acompanhe.' },
  { id: 'resultados', img: '/system-screenshots/s-resultados.png', title: 'Resultados Reais', desc: '264+ usuarios ativos em operacao real.' },
  { id: 'auth', img: '/system-screenshots/auth.png', title: 'Tela de Acesso', desc: 'Login seguro com email, senha, passkey ou codigo.' },
  { id: 'tecnologias', img: '/system-screenshots/s-tecnologias.png', title: 'Stack Tecnologico', desc: 'React, Supabase, Cloudflare e Capacitor.' },
];

const TOTAL = PAGES.length;

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export default function InteractiveBook() {
  const sectionRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const { isMobile, isTablet, s: scale, w: vw } = useResponsive();

  useEffect(() => {
    const onScroll = () => {
      const el = sectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const height = el.offsetHeight;
      const vh = window.innerHeight;
      const elTop = rect.top + window.scrollY;
      const y = window.scrollY;
      if (y < elTop) { setProgress(0); return; }
      if (y > elTop + height - vh) { setProgress(1); return; }
      setProgress((y - elTop) / (height - vh));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const phase = progress < 0.06 ? 'closed' : progress < 0.18 ? 'opening' : progress < 0.92 ? 'open' : 'closing';
  const pageProg = Math.max(0, Math.min(1, (progress - 0.18) / 0.74));
  const rawPage = pageProg * TOTAL;
  const currentPageIndex = Math.min(Math.floor(rawPage), TOTAL - 1);
  const flipFraction = rawPage - currentPageIndex;

  const closedMaxW = isMobile ? Math.round(vw * 0.68) : isTablet ? Math.round(vw * 0.48) : Math.round(260 * scale);
  const openMaxW = isMobile ? Math.round(vw * 0.92) : isTablet ? Math.round(vw * 0.75) : Math.round(800 * scale);
  const scrollVh = isMobile ? 45 : isTablet ? 52 : 65;

  return (
    <div ref={sectionRef} style={{ height: `${100 + TOTAL * scrollVh}vh`, position: 'relative' }}>
      <div style={{ position: 'sticky', top: 0, height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'rgba(46,125,50,0.08)', zIndex: 60 }}>
          <div style={{ height: '100%', width: `${progress * 100}%`, background: 'linear-gradient(90deg, #2E7D32, #43A047)', borderRadius: '0 2px 2px 0' }} />
        </div>
        {phase === 'open' && (
          <div style={{
            position: 'absolute', top: isMobile ? 8 : 20, left: '50%', transform: 'translateX(-50%)',
            padding: isMobile ? '0.25rem 0.7rem' : '0.3rem 1rem',
            background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(46,125,50,0.1)',
            borderRadius: 20, fontSize: isMobile ? '0.58rem' : '0.72rem',
            fontWeight: 700, color: '#2E7D32', zIndex: 60, whiteSpace: 'nowrap',
          }}>
            Pagina {currentPageIndex + 1} de {TOTAL}
          </div>
        )}
        <div style={{
          perspective: 1600, width: '100%', position: 'relative', padding: '0 1rem',
          maxWidth: phase === 'closed' ? closedMaxW : openMaxW,
          aspectRatio: phase === 'closed' ? '3/4' : isMobile ? '4/3' : isTablet ? '4/3' : '3/2',
          transition: 'max-width 0.7s cubic-bezier(0.23,1,0.32,1), aspect-ratio 0.7s cubic-bezier(0.23,1,0.32,1)',
        }}>
          {phase === 'closed' && <ClosedBook scale={scale} isMobile={isMobile} />}
          {phase === 'opening' && <OpeningBook progress={progress} scale={scale} isMobile={isMobile} />}
          {phase === 'open' && <FlippingBook currentPageIndex={currentPageIndex} flipFraction={flipFraction} scale={scale} isMobile={isMobile} isTablet={isTablet} />}
          {phase === 'closing' && <ClosingBook progress={progress} scale={scale} isMobile={isMobile} />}
        </div>
        {progress < 0.04 && (
          <div style={{ position: 'absolute', bottom: isMobile ? '1.5rem' : '3rem', left: '50%', transform: 'translateX(-50%)', textAlign: 'center', animation: 'scrollPulse 2s ease-in-out infinite' }}>
            <p style={{ fontSize: isMobile ? '0.62rem' : '0.8rem', color: '#6a8a6a', fontWeight: 600, marginBottom: '0.5rem' }}>Role para baixo para abrir o livro</p>
            <div style={{ width: 20, height: 32, border: '2px solid #2E7D32', borderRadius: 10, margin: '0 auto', position: 'relative' }}>
              <div style={{ position: 'absolute', top: 5, left: '50%', transform: 'translateX(-50%)', width: 3, height: 7, borderRadius: 3, background: '#2E7D32', animation: 'scrollDot 1.5s ease-in-out infinite' }} />
            </div>
          </div>
        )}
        {progress >= 0.96 && (
          <div style={{ position: 'absolute', bottom: isMobile ? '1.5rem' : '3rem', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
            <p style={{ fontSize: isMobile ? '0.62rem' : '0.8rem', color: '#6a8a6a', fontWeight: 600 }}>Continue rolando</p>
          </div>
        )}
      </div>
      <style>{`
        @keyframes scrollPulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
        @keyframes scrollDot { 0% { opacity:1; transform:translateX(-50%) translateY(0); } 100% { opacity:0; transform:translateX(-50%) translateY(12px); } }
      `}</style>
    </div>
  );
}

function FlippingBook({ currentPageIndex, flipFraction, scale = 1, isMobile = false, isTablet = false }) {
  const isFlipping = flipFraction > 0.01 && currentPageIndex < TOTAL - 1;
  const angle = isFlipping ? easeInOutCubic(flipFraction) * 180 : 0;

  const nextPageIndex = Math.min(currentPageIndex + 1, TOTAL - 1);
  const currentPage = PAGES[currentPageIndex];
  const nextPage = PAGES[nextPageIndex];

  const curveX = Math.sin(angle * Math.PI / 180) * 4;
  const shadowOpacity = Math.sin(angle * Math.PI / 180) * 0.2;
  const foldIntensity = Math.sin(angle * Math.PI / 180) * 0.12;

  const bookRadius = isMobile ? '4px 12px 12px 4px' : isTablet ? '5px 16px 16px 5px' : '6px 20px 20px 6px';
  const bookShadow = isMobile ? '6px 6px 24px rgba(0,0,0,0.2)' : isTablet ? '8px 8px 30px rgba(0,0,0,0.22)' : '10px 10px 35px rgba(0,0,0,0.25)';

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', borderRadius: bookRadius, overflow: 'hidden', boxShadow: bookShadow, background: '#1a1a1a' }}>
      {/* Pagina de fundo */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 1, overflow: 'hidden' }}>
        <img
          src={nextPage.img}
          alt={nextPage.title}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          draggable={false}
        />
      </div>

      {/* Folha Virando */}
      {isFlipping && (
        <div style={{
          position: 'absolute', top: 0, left: '50%', width: '50%', height: '100%',
          transformOrigin: 'left center',
          transform: `rotateY(${-angle}deg) rotateX(${curveX}deg)`,
          transformStyle: 'preserve-3d',
          zIndex: angle > 90 ? 5 : 40,
          willChange: 'transform',
        }}>
          {/* Frente: Pagina ANTIGA */}
          <div style={{
            position: 'absolute', inset: 0,
            backfaceVisibility: 'hidden',
            overflow: 'hidden',
            borderRadius: `0 ${isMobile ? 12 : 20}px ${isMobile ? 12 : 20}px 0`,
          }}>
            <img
              src={currentPage.img}
              alt={currentPage.title}
              style={{
                position: 'absolute', top: 0, left: '-100%',
                width: '200%', height: '100%',
                objectFit: 'contain',
              }}
              draggable={false}
            />
            <div style={{
              position: 'absolute', top: 0, left: 0, bottom: 0, width: isMobile ? 20 : 35,
              background: `linear-gradient(90deg, rgba(0,0,0,${foldIntensity}), transparent)`,
              pointerEvents: 'none',
            }} />
          </div>

          {/* Verso: Pagina NOVA */}
          <div style={{
            position: 'absolute', inset: 0,
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            overflow: 'hidden',
            borderRadius: `${isMobile ? 12 : 20}px 0 0 ${isMobile ? 12 : 20}px`,
          }}>
            <img
              src={nextPage.img}
              alt={nextPage.title}
              style={{
                position: 'absolute', top: 0, left: '-100%',
                width: '200%', height: '100%',
                objectFit: 'contain',
                transform: 'scaleX(-1)',
              }}
              draggable={false}
            />
            <div style={{
              position: 'absolute', top: 0, right: 0, bottom: 0, width: isMobile ? 20 : 35,
              background: `linear-gradient(270deg, rgba(0,0,0,${foldIntensity}), transparent)`,
              pointerEvents: 'none',
            }} />
          </div>
        </div>
      )}

      {/* Sombra dinamica */}
      {isFlipping && angle > 3 && angle < 177 && (
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `${50 + Math.sin(angle * Math.PI / 180) * 20}%`,
          width: '20%',
          background: `linear-gradient(270deg, rgba(0,0,0,${shadowOpacity}), transparent 80%)`,
          pointerEvents: 'none',
          zIndex: 10,
        }} />
      )}
    </div>
  );
}

function ClosedBook({ scale = 1, isMobile = false }) {
  const bookRadius = isMobile ? '4px 12px 12px 4px' : '6px 20px 20px 6px';
  const bookShadow = isMobile ? '8px 8px 24px rgba(0,0,0,0.22), 2px 2px 8px rgba(0,0,0,0.1)' : '14px 14px 40px rgba(0,0,0,0.3), 5px 5px 15px rgba(0,0,0,0.15)';

  return (
    <div style={{ width: '100%', height: '100%', transformStyle: 'preserve-3d', transform: isMobile ? 'rotateX(3deg) rotateY(-12deg)' : 'rotateX(5deg) rotateY(-18deg)' }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: bookRadius, overflow: 'hidden', boxShadow: bookShadow }}>
        <CoverFace scale={scale} isMobile={isMobile} />
      </div>
      <div style={{ position: 'absolute', bottom: isMobile ? -8 : -16, left: '8%', right: '-3%', height: isMobile ? 12 : 20, background: 'radial-gradient(ellipse, rgba(0,0,0,0.12) 0%, transparent 70%)', filter: 'blur(5px)', borderRadius: '50%' }} />
    </div>
  );
}

function OpeningBook({ progress, scale = 1, isMobile = false }) {
  const bookRadius = isMobile ? '4px 12px 12px 4px' : '6px 20px 20px 6px';
  const bookShadow = isMobile ? '6px 3px 20px rgba(0,0,0,0.2)' : '8px 4px 25px rgba(0,0,0,0.25)';

  return (
    <div style={{ width: '100%', height: '100%', transformStyle: 'preserve-3d', transform: `rotateX(${5 - progress * 20}deg) rotateY(${-18 + progress * 120}deg)` }}>
      <div style={{ position: 'absolute', inset: 0, transformOrigin: 'left center', backfaceVisibility: 'hidden', borderRadius: bookRadius, overflow: 'hidden', boxShadow: bookShadow }}>
        <CoverFace scale={scale} isMobile={isMobile} />
      </div>
      <div style={{ position: 'absolute', inset: 0, background: '#1B5E20', borderRadius: bookRadius, zIndex: -1 }} />
    </div>
  );
}

function ClosingBook({ progress, scale = 1, isMobile = false }) {
  const t = (progress - 0.92) / 0.08;
  const bookRadius = isMobile ? '4px 12px 12px 4px' : '6px 20px 20px 6px';
  const bookShadow = isMobile ? '10px 10px 30px rgba(0,0,0,0.25)' : '14px 14px 40px rgba(0,0,0,0.3)';

  return (
    <div style={{ width: '100%', height: '100%', transformStyle: 'preserve-3d', transform: `rotateX(${4 + t * 60}deg) rotateY(${t * -200}deg)` }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: bookRadius, overflow: 'hidden', boxShadow: bookShadow }}>
        <CoverFace scale={scale} isMobile={isMobile} />
      </div>
    </div>
  );
}

function CoverFace({ scale = 1, isMobile = false }) {
  const borderInset = isMobile ? 8 : 12;
  const decorSize = isMobile ? 100 : 140;
  const iconSize = isMobile ? 'clamp(48px, 14vw, 64px)' : 'clamp(40px, 10vw, 64px)';
  const iconRadius = isMobile ? 'clamp(12px, 4vw, 16px)' : 'clamp(10px, 3vw, 16px)';
  const titleSize = isMobile ? 'clamp(1.1rem, 4vw, 2.2rem)' : 'clamp(1rem, 3vw, 2.2rem)';
  const descSize = isMobile ? 'clamp(0.55rem, 1.8vw, 0.8rem)' : 'clamp(0.5rem, 1.2vw, 0.8rem)';
  const svgSize = isMobile ? 30 : 34;

  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'linear-gradient(145deg, #1B5E20 0%, #2E7D32 45%, #43A047 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: isMobile ? 'clamp(0.6rem, 2vw, 1.2rem)' : 'clamp(0.8rem, 3vw, 2rem)',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 25% 35%, rgba(255,255,255,0.06) 0%, transparent 50%)' }} />
      <div style={{ position: 'absolute', top: -decorSize * 0.14, right: -decorSize * 0.14, width: decorSize, height: decorSize, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
      <div style={{ position: 'absolute', inset: borderInset, border: '1px solid rgba(255,255,255,0.1)', borderRadius: `3px ${isMobile ? 10 : 14}px ${isMobile ? 10 : 14}px 3px` }} />
      <div style={{
        width: iconSize, height: iconSize, borderRadius: iconRadius,
        background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: isMobile ? '0.6rem' : '1rem', border: '1px solid rgba(255,255,255,0.15)',
      }}>
        <svg width={svgSize} height={svgSize} viewBox="0 0 256 256" fill="none">
          <path d="M74 66C74 60.477 78.477 56 84 56H158C172.359 56 184 67.641 184 82V177C184 182.523 179.523 187 174 187H102C86.536 187 74 174.464 74 159V66Z" fill="rgba(255,255,255,0.9)"/>
          <circle cx="170" cy="169" r="27" fill="rgba(255,255,255,0.9)"/>
          <path d="M158 169h24M170 157v24" stroke="#2E7D32" strokeWidth="8" strokeLinecap="round"/>
        </svg>
      </div>
      <h2 style={{ fontSize: titleSize, fontWeight: 900, color: '#fff', textAlign: 'center', letterSpacing: '-0.02em', textShadow: '0 2px 12px rgba(0,0,0,0.2)', marginBottom: '0.2rem' }}>BibliotecAI</h2>
      <p style={{ fontSize: descSize, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 1.5, maxWidth: isMobile ? 180 : 240 }}>Plataforma inteligente para gestao de bibliotecas escolares</p>
      <div style={{ position: 'absolute', bottom: isMobile ? 10 : 16, fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', fontWeight: 700, letterSpacing: '0.15em' }}>2025-2026</div>
    </div>
  );
}
