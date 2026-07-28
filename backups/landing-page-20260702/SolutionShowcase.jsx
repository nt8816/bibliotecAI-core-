import { useState, useRef, useEffect, useCallback } from 'react';
import { useResponsive } from '../hooks/useBreakpoint';

function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
function back(t) { const c = 2.70158; return 1 + c * Math.pow(t - 1, 3) + (c - 1) * Math.pow(t - 1, 2); }
function clamp01(t) { return Math.max(0, Math.min(1, t)); }
function anim(p, start, speed) { return easeOut(clamp01((p - start) * speed)); }

function BookScene({ p, s, isMobile }) {
  const bs = back(clamp01(p * 2));
  const aiP = p > 0.12 ? Math.sin((p - 0.12) * 8) * 0.12 + 1 : 0;
  const aiO = clamp01((p - 0.12) * 3);
  const aiR = p > 0.12 ? (p - 0.12) * 120 : 0;
  const m = isMobile;
  const bookW = m ? 130 : 120 * s;
  const bookH = m ? 180 : 160 * s;
  const cards = [
    { l: 'Sinopse gerada', c: '#2E7D32', pr: back(clamp01((p - 0.25) * 1.8)), a: -40, d: m ? 110 : 155 * s },
    { l: 'Resumo pronto', c: '#1565C0', pr: back(clamp01((p - 0.35) * 1.8)), a: 0, d: m ? 115 : 165 * s },
    { l: 'Quiz criado', c: '#6A1B9A', pr: back(clamp01((p - 0.45) * 1.8)), a: 40, d: m ? 110 : 155 * s },
  ];
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ transform: `scale(${bs})`, opacity: clamp01(p * 2.5), zIndex: 5 }}>
        <div style={{ width: bookW, height: bookH, background: 'linear-gradient(135deg, #1B5E20, #2E7D32)', borderRadius: m ? '4px 14px 14px 4px' : '4px 12px 12px 4px', boxShadow: '4px 4px 20px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: m ? 16 : 14 * s, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: m ? 8 : 7 * s, background: 'linear-gradient(90deg, rgba(0,0,0,0.2), rgba(0,0,0,0.05))' }} />
          <div style={{ fontSize: m ? 11 : 10 * s, color: 'rgba(255,255,255,0.6)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>Paulo Coelho</div>
          <div style={{ fontSize: m ? 16 : 14 * s, color: '#fff', fontWeight: 900, textAlign: 'center', lineHeight: 1.2 }}>O Alquimista</div>
          <div style={{ width: 24, height: 2, background: 'rgba(255,255,255,0.3)', margin: '8px 0', borderRadius: 1 }} />
          <svg width={m ? 18 : 16} height={m ? 18 : 16} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        </div>
      </div>
      <div style={{ position: 'absolute', top: m ? '12%' : '18%', left: '50%', transform: `translate(-50%,-50%) scale(${aiP}) rotate(${aiR}deg)`, opacity: aiO, zIndex: 10 }}>
        <div style={{ width: m ? 48 : 44, height: m ? 48 : 44, borderRadius: '50%', background: 'linear-gradient(135deg, #FFD54F, #FFB300)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 30px rgba(255,179,0,0.4)' }}>
          <svg width={m ? 22 : 20} height={m ? 22 : 20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61z" fill="rgba(255,255,255,0.3)"/></svg>
        </div>
      </div>
      {cards.map((c, i) => {
        const rad = c.a * Math.PI / 180;
        return (
          <div key={i} style={{ position: 'absolute', transform: `translate(${Math.sin(rad) * c.d * c.pr}px, ${-Math.cos(rad) * c.d * c.pr + (m ? 60 : 50 * s)}px) scale(${0.4 + 0.6 * c.pr})`, opacity: c.pr, zIndex: 15 }}>
            <div style={{ padding: m ? '6px 12px' : '7px 14px', background: '#fff', borderRadius: 10, border: `2px solid ${c.c}30`, boxShadow: `0 6px 18px ${c.c}20`, display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.c }} />
              <span style={{ fontSize: m ? 11 : 12 * s, fontWeight: 800, color: '#1a1a1a' }}>{c.l}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.c} strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LoanScene({ p, s, isMobile }) {
  const ps = back(clamp01(p * 2));
  const m = isMobile;
  const phoneW = m ? 180 : 170 * s;
  const phoneH = m ? 300 : 280 * s;
  const bookX = ease(clamp01((p - 0.18) * 1.8)) * -22 + ease(clamp01((p - 0.45) * 1.8)) * 22;
  const ckO = clamp01((p - 0.58) * 2.5);
  const ckS = back(clamp01((p - 0.58) * 2));
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ transform: `scale(${ps})`, opacity: clamp01(p * 2.5), width: phoneW, height: phoneH, background: '#1a1a1a', borderRadius: 22, padding: 7, boxShadow: '0 12px 40px rgba(0,0,0,0.3)', zIndex: 5 }}>
        <div style={{ width: '100%', height: '100%', background: '#fff', borderRadius: 17, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 28, background: '#2E7D32', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#fff', fontSize: m ? 10 : 9, fontWeight: 700 }}>BibliotecAI</span></div>
          <div style={{ flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {['Maria Silva', 'Joao Pedro', 'Ana Clara'].map((n, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', background: i === 0 ? '#E8F5E9' : '#f5f5f5', borderRadius: 8, border: i === 0 ? '1.5px solid #43A047' : '1px solid #eee' }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: i === 0 ? '#43A047' : '#bbb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9, fontWeight: 800 }}>{n[0]}</div>
                <span style={{ fontSize: m ? 11 : 10, fontWeight: 700, color: '#333', flex: 1 }}>{n}</span>
                {i === 0 && <span style={{ fontSize: m ? 8 : 7, color: '#43A047', fontWeight: 700 }}>1 livro</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: `${52 + bookX}%`, top: '38%', transform: 'translate(-50%,-50%)', opacity: p > 0.15 ? 1 : 0, zIndex: 8 }}>
        <div style={{ width: m ? 55 : 50, height: m ? 75 : 68, background: 'linear-gradient(135deg, #795548, #5D4037)', borderRadius: '2px 6px 6px 2px', boxShadow: '2px 2px 10px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: '#fff', fontSize: m ? 7 : 6, fontWeight: 700, textAlign: 'center', lineHeight: 1.2 }}>Dom<br/>Casmurro</span>
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: '18%', left: '50%', transform: `translateX(-50%) scale(${ckS})`, opacity: ckO, zIndex: 10 }}>
        <div style={{ padding: m ? '8px 16px' : '7px 14px', background: '#fff', borderRadius: 11, border: '2px solid #43A047', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 16px rgba(67,160,71,0.2)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#43A047" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
          <span style={{ fontSize: m ? 12 : 11, fontWeight: 800, color: '#2E7D32' }}>Devolvido!</span>
        </div>
      </div>
    </div>
  );
}

function GameScene({ p, s, isMobile }) {
  const m = isMobile;
  const xp = Math.floor(ease(clamp01(p * 1.8)) * 50);
  const bar = ease(clamp01((p - 0.08) * 1.8));
  const badgeS = back(clamp01((p - 0.22) * 2));
  const badgeO = clamp01((p - 0.20) * 2.5);
  const badgeG = p > 0.22 ? Math.sin((p - 0.22) * 8) * 0.3 + 0.7 : 0;
  const rankO = clamp01((p - 0.38) * 2);
  const rankY = 40 - back(clamp01((p - 0.38) * 1.8)) * 40;
  const trophyS = back(clamp01((p - 0.50) * 2));
  const trophyO = clamp01((p - 0.48) * 2.5);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', top: m ? '8%' : '12%', left: '50%', transform: 'translateX(-50%)', opacity: clamp01(p * 2.5), textAlign: 'center', zIndex: 10 }}>
        <div style={{ fontSize: m ? 10 : 9, color: '#F9A825', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Experiencia</div>
        <div style={{ fontSize: m ? 40 : 36 * s, fontWeight: 900, color: '#F9A825', lineHeight: 1, fontFamily: 'monospace' }}>+{xp}</div>
        <div style={{ fontSize: m ? 12 : 11, color: '#999', fontWeight: 700 }}>XP</div>
      </div>
      <div style={{ position: 'absolute', top: '38%', left: '50%', transform: 'translateX(-50%)', width: m ? 220 : 200 * s, opacity: clamp01((p - 0.06) * 2.5), zIndex: 10 }}>
        <div style={{ width: '100%', height: m ? 16 : 14, background: '#E0E0E0', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ width: `${bar * 100}%`, height: '100%', background: 'linear-gradient(90deg, #F9A825, #FF8F00)', borderRadius: 8 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}><span style={{ fontSize: m ? 9 : 8, color: '#999' }}>Nivel 4</span><span style={{ fontSize: m ? 9 : 8, color: '#F9A825', fontWeight: 700 }}>{Math.floor(bar * 100)}%</span></div>
      </div>
      <div style={{ position: 'absolute', top: '53%', left: '50%', transform: `translateX(-50%) scale(${badgeS})`, opacity: badgeO, zIndex: 10 }}>
        <div style={{ width: m ? 76 : 70 * s, height: m ? 76 : 70 * s, borderRadius: '50%', background: 'linear-gradient(135deg, #FFD54F, #FFB300)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 ${30 * badgeG}px rgba(255,179,0,${badgeG * 0.5})`, border: '3px solid #fff' }}>
          <svg width={m ? 18 : 16} height={m ? 18 : 16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="rgba(255,255,255,0.2)"/></svg>
          <span style={{ fontSize: m ? 12 : 11, fontWeight: 900, color: '#fff', marginTop: 2 }}>LV 5</span>
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: m ? '8%' : '10%', left: '50%', transform: `translateX(-50%) translateY(${rankY}px)`, opacity: rankO, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[{ n: 'Voce', c: '#FFD54F', m: true }, { n: 'Pedro H.', c: '#E0E0E0' }, { n: 'Maria S.', c: '#FFCC80' }].map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: m ? '6px 14px' : '5px 12px', background: r.m ? '#FFF8E1' : '#fff', borderRadius: 8, border: r.m ? '1.5px solid #F9A825' : '1px solid #eee', minWidth: m ? 160 : 140 }}>
            <div style={{ width: m ? 22 : 20, height: m ? 22 : 20, borderRadius: '50%', background: r.c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: m ? 9 : 8, fontWeight: 900, color: r.m ? '#F57F17' : '#666' }}>{i + 1}</div>
            <span style={{ fontSize: m ? 11 : 10, fontWeight: r.m ? 800 : 600, color: '#333', flex: 1 }}>{r.n}</span>
            {r.m && <svg width="10" height="10" viewBox="0 0 24 24" fill="#F9A825"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>}
          </div>
        ))}
      </div>
    </div>
  );
}

function AppScene({ p, s, isMobile }) {
  const ps = back(clamp01(p * 2));
  const m = isMobile;
  const phoneW = m ? 190 : 180 * s;
  const phoneH = m ? 320 : 300 * s;
  const nfS = ease(clamp01((p - 0.14) * 2));
  const nfO = clamp01((p - 0.12) * 2.5);
  const c1 = back(clamp01((p - 0.28) * 2));
  const c2 = back(clamp01((p - 0.36) * 2));
  const c3 = back(clamp01((p - 0.44) * 2));
  const fO = clamp01((p - 0.52) * 2.5);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ transform: `scale(${ps})`, opacity: clamp01(p * 2.5), width: phoneW, height: phoneH, background: '#1a1a1a', borderRadius: 24, padding: 8, boxShadow: '0 14px 45px rgba(0,0,0,0.35)', zIndex: 5 }}>
        <div style={{ width: '100%', height: '100%', background: '#fff', borderRadius: 18, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: m ? 40 : 36, background: 'linear-gradient(135deg, #2E7D32, #43A047)', display: 'flex', alignItems: 'center', padding: '0 10px', gap: 5 }}>
            <div style={{ width: m ? 20 : 18, height: m ? 20 : 18, borderRadius: 4, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width={m ? 10 : 9} height={m ? 10 : 9} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            </div>
            <span style={{ color: '#fff', fontSize: m ? 10 : 9, fontWeight: 800 }}>BibliotecAI</span>
          </div>
          <div style={{ flex: 1, padding: m ? 8 : 7, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[{ t: 'Alguem leu O Alquimista?', f: 'Ana', a: 'flex-start', bg: '#f0f0f0', pr: c1 }, { t: 'Sim! Muito bom!', f: 'Voce', a: 'flex-end', bg: '#E8F5E9', pr: c2 }, { t: 'Vou pegar emprestado!', f: 'Pedro', a: 'flex-start', bg: '#f0f0f0', pr: c3 }].map((c, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: c.a, transform: `translateY(${(1 - c.pr) * 12}px)`, opacity: c.pr }}>
                <div style={{ padding: m ? '5px 9px' : '4px 7px', background: c.bg, borderRadius: 9, maxWidth: '80%' }}>
                  <span style={{ fontSize: m ? 8 : 7, color: '#999', fontWeight: 600 }}>{c.f}</span>
                  <div style={{ fontSize: m ? 10 : 9, color: '#333', lineHeight: 1.3 }}>{c.t}</div>
                </div>
              </div>
            ))}
            <div style={{ opacity: fO, marginTop: 3 }}>
              <div style={{ fontSize: m ? 8 : 7, fontWeight: 800, color: '#2E7D32', marginBottom: 3 }}>Comunidade</div>
              {['Joao completou quiz!', 'Maria ganhou badge'].map((item, i) => (
                <div key={i} style={{ padding: m ? '4px 6px' : '3px 5px', background: '#FAFAFA', borderRadius: 5, border: '1px solid #eee', marginBottom: 2 }}>
                  <span style={{ fontSize: m ? 8 : 7, color: '#555' }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div style={{ position: 'absolute', top: '6%', right: m ? '4%' : '6%', transform: `translateY(${(1 - nfS) * -35}px)`, opacity: nfO, zIndex: 15 }}>
        <div style={{ padding: m ? '8px 13px' : '7px 11px', background: '#fff', borderRadius: 11, boxShadow: '0 8px 20px rgba(0,0,0,0.12)', border: '1px solid #E8F5E9', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: m ? 28 : 26, height: m ? 28 : 26, borderRadius: 7, background: '#2E7D32', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/></svg>
          </div>
          <div><div style={{ fontSize: m ? 10 : 9, fontWeight: 800, color: '#1a1a1a' }}>Quiz disponivel!</div><div style={{ fontSize: m ? 8 : 7, color: '#888' }}>Responda e ganhe XP</div></div>
        </div>
      </div>
    </div>
  );
}

const BLOCKS = [
  { C: BookScene, title: 'Catalogo com IA', desc: 'Cadastre livros e a IA gera sinopses, resumos e quizzes.', color: '#2E7D32', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
  { C: LoanScene, title: 'Emprestimos', desc: 'Controle total com devolucao automatica e notificacoes.', color: '#43A047', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { C: GameScene, title: 'Gamificacao', desc: 'XP, niveis, ranking e badges que motivam a ler.', color: '#F9A825', icon: 'M12 15l-2 5l9-12h-7l2-5l-9 12h7z' },
  { C: AppScene, title: 'App Mobile', desc: 'Notificacoes push, chat e comunidade integrada.', color: '#0288D1', icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z' },
];

export default function SolutionShowcase() {
  const ref = useRef(null);
  const [progress, setProgress] = useState(0);
  const { isMobile, s } = useResponsive();

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const p = Math.max(0, Math.min(1, (-rect.top) / (rect.height - vh)));
    setProgress(p);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [onScroll]);

  const ab = Math.min(3, Math.floor(progress * 4));
  const bp = (progress * 4) - ab;
  const hOp = Math.min(1, progress * 6);
  const hY = 30 - progress * 60;
  const tF = easeOut(clamp01(bp * 2.5));
  const tY = 15 - easeOut(clamp01(bp * 2)) * 15;
  const scP = clamp01((bp - 0.30) / 0.70);
  const block = BLOCKS[ab];
  const Scene = block.C;

  return (
    <div ref={ref} style={{ height: '800vh', position: 'relative' }}>
      <div style={{ position: 'sticky', top: 0, height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'rgba(46,125,50,0.12)', zIndex: 60 }}>
          <div style={{ height: '100%', width: `${progress * 100}%`, background: 'linear-gradient(90deg, #2E7D32, #43A047, #66BB6A)', borderRadius: 2 }} />
        </div>
        <div style={{ textAlign: 'center', width: '100%', padding: isMobile ? '3.5rem 1rem 0' : '2rem 1rem 0', zIndex: 20, opacity: hOp, transform: `translateY(${hY}px)` }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.35rem 0.8rem', background: 'rgba(46,125,50,0.1)', border: '1px solid rgba(46,125,50,0.2)', borderRadius: 50, fontSize: isMobile ? '0.62rem' : '0.72rem', fontWeight: 800, color: '#66BB6A', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2E7D32" strokeWidth="2.5"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
            A Solucao
          </div>
          <h2 style={{ fontSize: 'clamp(1.2rem, 3.5vw, 2.2rem)', fontWeight: 900, lineHeight: 1.15, letterSpacing: '-0.02em', color: '#e8f5e9', marginTop: '0.5rem' }}>Transformando a leitura.</h2>
        </div>
        <div style={{ textAlign: 'center', padding: isMobile ? '1.5rem 1rem 0' : '1.2rem 1rem 0', zIndex: 20, opacity: tF, transform: `translateY(${tY}px)` }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 26 * s, height: 26 * s, borderRadius: 7, background: `${block.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={block.color} strokeWidth="2"><path d={block.icon}/></svg>
            </div>
            <span style={{ fontSize: isMobile ? '0.72rem' : '0.82rem', fontWeight: 900, color: block.color }}>{block.title}</span>
          </div>
          <p style={{ fontSize: isMobile ? '0.6rem' : '0.68rem', color: 'rgba(200,230,201,0.5)', marginTop: '0.15rem' }}>{block.desc}</p>
        </div>
        <div style={{ flex: 1, width: '100%', position: 'relative', overflow: 'hidden' }}>
          <Scene p={scP} s={s} isMobile={isMobile} />
        </div>
        <div style={{ display: 'flex', gap: 7, padding: '0.4rem 0 1.2rem', zIndex: 20 }}>
          {BLOCKS.map((b, i) => (
            <div key={i} style={{ width: i === ab ? 22 : 7, height: 7, borderRadius: 4, background: i === ab ? b.color : 'rgba(200,230,201,0.2)' }} />
          ))}
        </div>
      </div>
    </div>
  );
}
