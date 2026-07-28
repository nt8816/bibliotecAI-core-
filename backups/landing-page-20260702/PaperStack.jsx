import { useState, useRef, useEffect, useCallback } from 'react';
import { useResponsive } from '../hooks/useBreakpoint';

const PAPERS = [
  { title: 'Controle manual', lines: ['Planilha 2023.xlsx', 'Backup???', 'Dados de 2019 perdidos', 'Versao 3_final_v2_REAL', 'Quem atualizou? Ninguem'] },
  { title: 'WhatsApp como sistema', lines: ['Grupo "Biblioteca 2024"', '583 mensagens nao lidas', 'Arquivo: "leiam pdf aqui"', 'Aluno: "qual livro?"'] },
  { title: 'Alunos sem incentivo', lines: ['Ranking: vazio', 'XP ganho: 0', 'Livros lidos: -', 'Motivacao: zero'] },
  { title: 'Acervo invisivel', lines: ['Total livros: sei la', 'Disponivel: talvez', 'Devolvido: quando?', 'Perdido: varios'] },
];

function Paper({ p, index, progress, s, isMobile }) {
  const enter = Math.max(0, Math.min(1, (progress - 0.01 - index * 0.12) / 0.12));
  const ease = enter * enter * (3 - 2 * enter);
  const yStart = -350 - index * 25;
  const y = yStart + (index * 5 * s - yStart) * ease;
  const rot = ((index % 2 === 0 ? -1 : 1) * (8 + index * 4)) * (1 - ease) + (index % 2 === 0 ? 1 : -1) * (1 + index * 0.8) * ease;
  const sc = 0.92 + 0.08 * ease;
  const op = Math.min(1, enter * 4);

  const scatter = Math.max(0, Math.min(1, (progress - 0.80) / 0.12));
  const sx = [-180, 170, -130, 150][index] * s * scatter;
  const sy = [-100, -70, 90, 110][index] * s * scatter;
  const sr = [-30, 35, -45, 25][index] * scatter;

  const pw = isMobile ? Math.round(200) : Math.round(240 * s);
  const ph = isMobile ? Math.round(290) : Math.round(340 * s);

  return (
    <div style={{
      position: 'absolute', width: pw, height: ph,
      left: '50%', top: '50%', marginLeft: -pw / 2, marginTop: -ph / 2,
      transform: `translateY(${y + sy}px) translateX(${sx}px) rotate(${rot + sr}deg) scale(${sc})`,
      opacity: op * (1 - scatter * 0.6),
      zIndex: 10 + index + (scatter > 0 ? index * 12 : 0),
      willChange: 'transform, opacity',
    }}>
      <div style={{
        width: '100%', height: '100%',
        background: 'linear-gradient(175deg, #FFFEF7, #FBF8EF 30%, #F5F0E2 70%, #EDE8D6)',
        borderRadius: 3, position: 'relative', overflow: 'hidden',
        boxShadow: `0 ${2 + index * 2}px ${8 + index * 3}px rgba(0,0,0,${0.1 + index * 0.02}), 0 1px 3px rgba(0,0,0,0.08)`,
      }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: isMobile ? 22 : Math.round(28 * s), width: 1, background: 'rgba(220,80,80,0.15)' }} />
        <div style={{ position: 'absolute', top: isMobile ? 10 : Math.round(12 * s), left: isMobile ? 28 : Math.round(34 * s), right: isMobile ? 14 : Math.round(18 * s), fontWeight: 900, fontSize: isMobile ? 11 : Math.round(12 * s), color: '#2a2015', fontFamily: "Georgia, serif", borderBottom: '1.5px solid rgba(0,0,0,0.1)', paddingBottom: 5 }}>
          {p.title}
        </div>
        <div style={{ position: 'absolute', top: isMobile ? 36 : Math.round(42 * s), left: isMobile ? 28 : Math.round(34 * s), right: isMobile ? 14 : Math.round(18 * s), bottom: isMobile ? 14 : Math.round(18 * s), display: 'flex', flexDirection: 'column', gap: isMobile ? 2 : Math.round(2 * s) }}>
          {p.lines.map((line, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, height: isMobile ? 20 : Math.round(22 * s) }}>
              <span style={{ fontSize: isMobile ? 7 : Math.round(8 * s), color: i < 2 ? '#D32F2F' : '#795548', flexShrink: 0 }}>
                {i < 2 ? '●' : '▪'}
              </span>
              <span style={{ fontSize: isMobile ? 9 : Math.round(10 * s), color: '#4a4035', fontFamily: "'Courier New', monospace", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {line}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PaperStack() {
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

  const hOp = Math.min(1, progress * 6);
  const hY = 30 - progress * 60;
  const sOp = Math.max(0, Math.min(1, (progress - 0.05) * 5));
  const rOp = Math.max(0, Math.min(1, (progress - 0.93) * 10));
  const rY = 20 - Math.max(0, (progress - 0.93) * 200);

  const pw = isMobile ? 200 : Math.round(240 * s);
  const ph = isMobile ? 290 : Math.round(340 * s);

  return (
    <div ref={ref} style={{ height: '550vh', position: 'relative' }}>
      <div style={{ position: 'sticky', top: 0, height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingTop: isMobile ? '3.5rem' : '0' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'rgba(244,67,54,0.12)', zIndex: 60 }}>
          <div style={{ height: '100%', width: `${progress * 100}%`, background: 'linear-gradient(90deg, #E53935, #FB8C00)', borderRadius: 2 }} />
        </div>
        <div style={{ position: 'absolute', top: isMobile ? '3%' : '5%', textAlign: 'center', width: '100%', zIndex: 20, padding: '0 1rem', opacity: hOp, transform: `translateY(${hY}px)` }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.4rem 0.9rem', background: 'rgba(244,67,54,0.1)', border: '1px solid rgba(244,67,54,0.2)', borderRadius: 50, fontSize: isMobile ? '0.65rem' : '0.75rem', fontWeight: 800, color: '#EF5350', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E53935" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            O Problema
          </div>
          <h2 style={{ fontSize: 'clamp(1.2rem, 3.5vw, 2.2rem)', fontWeight: 900, lineHeight: 1.15, letterSpacing: '-0.02em', color: '#e8f5e9', marginTop: '0.6rem' }}>
            Bibliotecas paradas no tempo.
          </h2>
          <p style={{ fontSize: isMobile ? '0.78rem' : '0.88rem', color: 'rgba(200,230,201,0.6)', lineHeight: 1.6, marginTop: '0.5rem', maxWidth: 400, margin: isMobile ? '0.5rem auto 0' : '0.4rem auto 0', opacity: sOp }}>
            Enquanto voce le, a pilha de problemas so cresce.
          </p>
        </div>
        <div style={{ position: 'relative', width: pw, height: ph, marginTop: isMobile ? '3.5rem' : '3rem' }}>
          {PAPERS.map((paper, i) => (
            <Paper key={i} p={paper} index={i} progress={progress} s={s} isMobile={isMobile} />
          ))}
        </div>
        <div style={{ position: 'absolute', bottom: isMobile ? '6%' : '10%', textAlign: 'center', width: '100%', opacity: rOp, transform: `translateY(${rY}px)`, zIndex: 30, padding: '0 1rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: isMobile ? '0.5rem 1rem' : '0.7rem 1.4rem', background: 'rgba(244,67,54,0.08)', border: '1px solid rgba(244,67,54,0.15)', borderRadius: 14, backdropFilter: 'blur(10px)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E53935" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            <span style={{ fontWeight: 800, fontSize: isMobile ? '0.7rem' : '0.82rem', color: '#E53935' }}>Dados perdidos e alunos sem ler</span>
          </div>
        </div>
      </div>
    </div>
  );
}
