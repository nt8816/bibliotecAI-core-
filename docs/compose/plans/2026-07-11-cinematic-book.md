# Livro Cinematográfico da Landing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the InteractiveBook screenshot pages with eight cinematic “movie frame” chapters (atmospheric backgrounds, punchy copy, subtle animation) and improve the 3D page-flip (curl, fold shadow, spine).

**Architecture:** Keep the existing scroll-driven sticky book shell in `InteractiveBook.jsx`. Extract page content and scroll→phase mapping into pure modules so they are unit-testable. A new `CinematicPage` renders each chapter (gradient mood, particle/glow layer, typography). `FlippingBook` keeps the two-face rotateY flip but adds a page-curl gradient, dynamic fold shadow, and a spine highlight.

**Tech Stack:** React 18 + Vite, inline styles (project convention on Landing), Vitest.

## Global Constraints

- Do NOT use system screenshots / `public/system-screenshots/*` inside the book.
- Do NOT change `ScrollCarousel.jsx` or capture live app screenshots in this plan (user deferred prints).
- Keep scroll-driven UX: sticky full-viewport book, progress bar, “Página X de 8”.
- Portuguese copy (no accents in UI strings is OK if matching existing landing style — prefer natural PT-BR with accents in new copy).
- Existing hook contract: `useResponsive()` returns `{ w, isMobile, isTablet, s }` from `src/hooks/useBreakpoint.js`.
- Landing sections must keep working: `LandingPage.jsx` still renders `<InteractiveBook />` inside `#book` — do not change that call site unless necessary.
- YAGNI: no new deps, no CMS, no framer-motion.

---

### Task 1: Cinematic chapter data + scroll phase mapping (pure)

**Covers:** design page sequence (8 chapters), progress→phase rules

**Files:**
- Create: `src/components/interactiveBook/chapters.js`
- Create: `src/components/interactiveBook/bookProgress.js`
- Test: `src/test/interactive-book.test.js`

**Interfaces:**
- Produces:
  - `CHAPTERS` — array of `{ id, kicker, title, subtitle, mood: { bg, glowA, glowB, text, accent }, particles: 'orbs'|'grid'|'rings'|'confetti'|'dots'|'none' }` length 8
  - `getBookPhase(progress: number): 'closed'|'opening'|'open'|'closing'`
  - `getPagePosition(progress: number, total: number): { pageIndex: number, flipFraction: number }`

- [ ] **Step 1: Write the failing test**

```js
// src/test/interactive-book.test.js
import { describe, it, expect } from 'vitest';
import { CHAPTERS } from '../components/interactiveBook/chapters';
import { getBookPhase, getPagePosition } from '../components/interactiveBook/bookProgress';

describe('interactive book chapters', () => {
  it('has 8 cinematic chapters with required fields', () => {
    expect(CHAPTERS).toHaveLength(8);
    for (const ch of CHAPTERS) {
      expect(ch.id).toBeTruthy();
      expect(ch.kicker).toBeTruthy();
      expect(ch.title).toBeTruthy();
      expect(ch.subtitle).toBeTruthy();
      expect(ch.mood.bg).toBeTruthy();
      expect(ch.mood.text).toBeTruthy();
    }
    expect(CHAPTERS[0].id).toBe('abertura');
    expect(CHAPTERS[7].id).toBe('cta');
  });

  it('maps progress to book phase thresholds', () => {
    expect(getBookPhase(0)).toBe('closed');
    expect(getBookPhase(0.1)).toBe('opening');
    expect(getBookPhase(0.5)).toBe('open');
    expect(getBookPhase(0.95)).toBe('closing');
  });

  it('maps progress to page index and flip fraction', () => {
    const total = CHAPTERS.length;
    const start = getPagePosition(0.18, total);
    expect(start.pageIndex).toBe(0);
    expect(start.flipFraction).toBeCloseTo(0, 5);

    const mid = getPagePosition(0.55, total);
    expect(mid.pageIndex).toBeGreaterThanOrEqual(0);
    expect(mid.pageIndex).toBeLessThan(total);
    expect(mid.flipFraction).toBeGreaterThanOrEqual(0);
    expect(mid.flipFraction).toBeLessThanOrEqual(1);

    const end = getPagePosition(0.92, total);
    expect(end.pageIndex).toBeLessThan(total);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/interactive-book.test.js`
Expected: FAIL — Cannot find module `../components/interactiveBook/chapters`

- [ ] **Step 3: Write implementation**

```js
// src/components/interactiveBook/chapters.js
export const CHAPTERS = [
  {
    id: 'abertura',
    kicker: '01 · Abertura',
    title: 'A biblioteca que a escola merecia.',
    subtitle: 'Acervo, alunos e leitura em um só lugar.',
    mood: {
      bg: 'radial-gradient(ellipse at 30% 40%, rgba(67,160,71,0.40) 0%, transparent 55%), radial-gradient(ellipse at 80% 70%, rgba(249,168,37,0.20) 0%, transparent 50%), #07120a',
      glowA: 'rgba(67,160,71,0.45)',
      glowB: 'rgba(249,168,37,0.25)',
      text: '#e8f5e9',
      accent: '#A5D6A7',
    },
    particles: 'orbs',
  },
  {
    id: 'problema',
    kicker: '02 · O problema',
    title: 'Planilha não é sistema.',
    subtitle: 'WhatsApp, papel e dados que somem não geram leitura.',
    mood: {
      bg: 'radial-gradient(ellipse at 70% 30%, rgba(229,57,53,0.28) 0%, transparent 50%), radial-gradient(ellipse at 20% 80%, rgba(255,152,0,0.15) 0%, transparent 45%), #140a0a',
      glowA: 'rgba(229,57,53,0.35)',
      glowB: 'rgba(255,152,0,0.20)',
      text: '#ffebee',
      accent: '#EF9A9A',
    },
    particles: 'none',
  },
  {
    id: 'virada',
    kicker: '03 · A virada',
    title: 'Tudo em um só lugar.',
    subtitle: 'Catálogo, empréstimos, avisos e turma conectados.',
    mood: {
      bg: 'radial-gradient(ellipse at 40% 50%, rgba(67,160,71,0.35) 0%, transparent 55%), #07120a',
      glowA: 'rgba(67,160,71,0.40)',
      glowB: 'rgba(46,125,50,0.25)',
      text: '#e8f5e9',
      accent: '#81C784',
    },
    particles: 'grid',
  },
  {
    id: 'ia',
    kicker: '04 · Inteligência',
    title: 'A IA lê por você.',
    subtitle: 'Sinopses, resumos e descoberta no catálogo — automaticamente.',
    mood: {
      bg: 'radial-gradient(ellipse at 60% 40%, rgba(79,195,247,0.30) 0%, transparent 55%), #07120a',
      glowA: 'rgba(79,195,247,0.40)',
      glowB: 'rgba(33,150,243,0.22)',
      text: '#e1f5fe',
      accent: '#81D4FA',
    },
    particles: 'orbs',
  },
  {
    id: 'gamificacao',
    kicker: '05 · Engajamento',
    title: 'Leitores viram jogadores.',
    subtitle: 'XP, níveis, ranking e desafios que fazem a turma voltar.',
    mood: {
      bg: 'radial-gradient(ellipse at 50% 60%, rgba(249,168,37,0.35) 0%, transparent 55%), #1a1205',
      glowA: 'rgba(249,168,37,0.45)',
      glowB: 'rgba(255,193,7,0.22)',
      text: '#fff8e1',
      accent: '#FFD54F',
    },
    particles: 'confetti',
  },
  {
    id: 'simplicidade',
    kicker: '06 · Simplicidade',
    title: '4 passos. Zero fricção.',
    subtitle: 'Cadastre, importe, convide e acompanhe.',
    mood: {
      bg: 'linear-gradient(145deg, #0a1a0d 0%, #1B5E20 100%)',
      glowA: 'rgba(67,160,71,0.30)',
      glowB: 'rgba(27,94,32,0.20)',
      text: '#e8f5e9',
      accent: '#A5D6A7',
    },
    particles: 'dots',
  },
  {
    id: 'impacto',
    kicker: '07 · Impacto',
    title: 'Menos planilha. Mais leitura.',
    subtitle: 'Operação leve para a biblioteca, hábito forte para o aluno.',
    mood: {
      bg: 'radial-gradient(ellipse at 50% 30%, rgba(102,187,106,0.30) 0%, transparent 50%), #07120a',
      glowA: 'rgba(102,187,106,0.40)',
      glowB: 'rgba(67,160,71,0.22)',
      text: '#e8f5e9',
      accent: '#C8E6C9',
    },
    particles: 'rings',
  },
  {
    id: 'cta',
    kicker: '08 · Próximo passo',
    title: 'Bora modernizar sua biblioteca?',
    subtitle: 'Role para continuar e conhecer cada tela do sistema.',
    mood: {
      bg: 'radial-gradient(ellipse at 50% 50%, rgba(46,125,50,0.45) 0%, transparent 60%), #0a1a0d',
      glowA: 'rgba(46,125,50,0.50)',
      glowB: 'rgba(67,160,71,0.28)',
      text: '#e8f5e9',
      accent: '#81C784',
    },
    particles: 'orbs',
  },
];
```

```js
// src/components/interactiveBook/bookProgress.js
export function getBookPhase(progress) {
  const p = clamp01(progress);
  if (p < 0.06) return 'closed';
  if (p < 0.18) return 'opening';
  if (p < 0.92) return 'open';
  return 'closing';
}

export function getPagePosition(progress, total) {
  const p = clamp01(progress);
  const pageProg = clamp01((p - 0.18) / 0.74);
  const safeTotal = Math.max(1, total);
  const rawPage = pageProg * safeTotal;
  const pageIndex = Math.min(Math.floor(rawPage), safeTotal - 1);
  const flipFraction = rawPage - pageIndex;
  return { pageIndex, flipFraction: clamp01(flipFraction) };
}

function clamp01(n) {
  return Math.max(0, Math.min(1, Number(n) || 0));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/interactive-book.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/interactiveBook/chapters.js src/components/interactiveBook/bookProgress.js src/test/interactive-book.test.js
git commit -m "feat(landing): add cinematic chapter data and book progress mapping"
```

---

### Task 2: CinematicPage + particle layer

**Covers:** cinematic page rendering (mood, kicker/title/subtitle, particles)

**Files:**
- Create: `src/components/interactiveBook/CinematicPage.jsx`
- Modify: `src/test/interactive-book.test.js` (add render smoke if easy; otherwise skip — pure data already covered)

**Interfaces:**
- Consumes: `CHAPTERS` items shape from Task 1
- Produces: default export `CinematicPage({ chapter, isMobile })` rendering a full-bleed cinematic face

- [ ] **Step 1: Write CinematicPage**

```jsx
// src/components/interactiveBook/CinematicPage.jsx
export default function CinematicPage({ chapter, isMobile = false }) {
  const { kicker, title, subtitle, mood, particles } = chapter;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: mood.bg,
        color: mood.text,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isMobile ? '1.4rem 1.2rem' : '2.2rem 2rem',
        position: 'relative',
        overflow: 'hidden',
        textAlign: 'center',
      }}
    >
      <GlowLayer mood={mood} />
      <ParticleLayer type={particles} accent={mood.accent} />
      <div style={{ position: 'relative', zIndex: 2, maxWidth: isMobile ? 420 : 560 }}>
        <div
          style={{
            fontSize: isMobile ? '0.58rem' : '0.68rem',
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            opacity: 0.55,
            fontWeight: 700,
            marginBottom: isMobile ? '0.7rem' : '1rem',
            color: mood.accent,
          }}
        >
          {kicker}
        </div>
        <h3
          style={{
            fontFamily: "'Space Grotesk', system-ui, sans-serif",
            fontSize: isMobile ? 'clamp(1.25rem, 5.2vw, 1.9rem)' : 'clamp(1.5rem, 3.2vw, 2.35rem)',
            fontWeight: 900,
            lineHeight: 1.15,
            letterSpacing: '-0.03em',
            margin: 0,
            textShadow: '0 8px 28px rgba(0,0,0,0.25)',
          }}
        >
          {title}
        </h3>
        <p
          style={{
            marginTop: isMobile ? '0.75rem' : '1rem',
            fontSize: isMobile ? '0.78rem' : '0.95rem',
            lineHeight: 1.6,
            opacity: 0.72,
            maxWidth: 420,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          {subtitle}
        </p>
      </div>
    </div>
  );
}

function GlowLayer({ mood }) {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at 35% 35%, ${mood.glowA} 0%, transparent 42%)`,
          opacity: 0.55,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at 75% 70%, ${mood.glowB} 0%, transparent 40%)`,
          opacity: 0.5,
        }}
      />
    </div>
  );
}

function ParticleLayer({ type, accent }) {
  if (type === 'none') return null;

  if (type === 'grid') {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.12,
          backgroundImage: `radial-gradient(circle at 2px 2px, ${accent} 1px, transparent 0)`,
          backgroundSize: '28px 28px',
          pointerEvents: 'none',
        }}
      />
    );
  }

  if (type === 'dots') {
    return (
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.35 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            style={{
              position: 'absolute',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: accent,
              left: `${12 + i * 18}%`,
              top: `${22 + (i % 3) * 18}%`,
              opacity: 0.5 + (i % 2) * 0.3,
              animation: `bookPulse ${2.2 + i * 0.35}s ease-in-out infinite`,
            }}
          />
        ))}
      </div>
    );
  }

  if (type === 'rings') {
    return (
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {[120, 180, 250].map((size, i) => (
          <div
            key={size}
            style={{
              position: 'absolute',
              width: size,
              height: size,
              borderRadius: '50%',
              border: `1px solid ${accent}`,
              opacity: 0.12 + i * 0.04,
              animation: `bookRing ${4 + i}s ease-out infinite`,
            }}
          />
        ))}
      </div>
    );
  }

  if (type === 'confetti') {
    const pieces = [
      { l: '12%', t: '18%', r: 18, c: accent },
      { l: '78%', t: '22%', r: -22, c: 'rgba(255,255,255,0.35)' },
      { l: '22%', t: '72%', r: 32, c: 'rgba(255,255,255,0.25)' },
      { l: '70%', t: '68%', r: -12, c: accent },
      { l: '48%', t: '40%', r: 8, c: 'rgba(255,255,255,0.2)' },
    ];
    return (
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {pieces.map((p, i) => (
          <span
            key={i}
            style={{
              position: 'absolute',
              left: p.l,
              top: p.t,
              width: 10,
              height: 14,
              borderRadius: 3,
              background: p.c,
              transform: `rotate(${p.r}deg)`,
              opacity: 0.55,
              animation: `bookFloat ${3 + (i % 3)}s ease-in-out infinite`,
            }}
          />
        ))}
      </div>
    );
  }

  // orbs (default)
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {[
        { s: 90, l: '12%', t: '20%', o: 0.18 },
        { s: 48, l: '76%', t: '28%', o: 0.14 },
        { s: 120, l: '58%', t: '62%', o: 0.12 },
        { s: 36, l: '24%', t: '70%', o: 0.16 },
      ].map((o, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            width: o.s,
            height: o.s,
            left: o.l,
            top: o.t,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${accent} 0%, transparent 70%)`,
            opacity: o.o,
            filter: 'blur(2px)',
            animation: `bookFloat ${4 + i * 0.6}s ease-in-out infinite`,
          }}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Register keyframes once in the book shell (do this in Task 3)**

Note: Task 3 injects the `@keyframes bookPulse`, `bookRing`, `bookFloat` via a single `<style>` in `InteractiveBook.jsx`. Do not duplicate global CSS.

- [ ] **Step 3: Commit**

```bash
git add src/components/interactiveBook/CinematicPage.jsx
git commit -m "feat(landing): add cinematic page renderer with ambient particles"
```

---

### Task 3: Rewrite InteractiveBook shell + improved page flip

**Covers:** flip upgrade (curl, fold shadow, spine), wire chapters, keep scroll shell

**Files:**
- Modify: `src/components/InteractiveBook.jsx` (full rewrite of internals; keep default export name/path)
- Keep: `src/pages/LandingPage.jsx` import path `../components/InteractiveBook` unchanged

**Interfaces:**
- Consumes: `CHAPTERS`, `getBookPhase`, `getPagePosition` (Task 1), `CinematicPage` (Task 2)
- Produces: `export default function InteractiveBook()` — same public component used by LandingPage

- [ ] **Step 1: Rewrite InteractiveBook.jsx**

Replace file contents with:

```jsx
import { useState, useRef, useEffect } from 'react';
import { useResponsive } from '../hooks/useBreakpoint';
import { CHAPTERS } from './interactiveBook/chapters';
import { getBookPhase, getPagePosition } from './interactiveBook/bookProgress';
import CinematicPage from './interactiveBook/CinematicPage';

const TOTAL = CHAPTERS.length;

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

  const phase = getBookPhase(progress);
  const { pageIndex, flipFraction } = getPagePosition(progress, TOTAL);

  const closedMaxW = isMobile ? Math.round(vw * 0.68) : isTablet ? Math.round(vw * 0.48) : Math.round(260 * scale);
  const openMaxW = isMobile ? Math.round(vw * 0.92) : isTablet ? Math.round(vw * 0.75) : Math.round(820 * scale);
  const scrollVh = isMobile ? 45 : isTablet ? 52 : 62;

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
            Capítulo {pageIndex + 1} de {TOTAL}
          </div>
        )}

        <div style={{
          perspective: 1800, width: '100%', position: 'relative', padding: '0 1rem',
          maxWidth: phase === 'closed' ? closedMaxW : openMaxW,
          aspectRatio: phase === 'closed' ? '3/4' : isMobile ? '4/3' : isTablet ? '4/3' : '16/10',
          transition: 'max-width 0.7s cubic-bezier(0.23,1,0.32,1), aspect-ratio 0.7s cubic-bezier(0.23,1,0.32,1)',
        }}>
          {phase === 'closed' && <ClosedBook scale={scale} isMobile={isMobile} />}
          {phase === 'opening' && <OpeningBook progress={progress} scale={scale} isMobile={isMobile} />}
          {phase === 'open' && <FlippingBook currentPageIndex={pageIndex} flipFraction={flipFraction} isMobile={isMobile} isTablet={isTablet} />}
          {phase === 'closing' && <ClosingBook progress={progress} scale={scale} isMobile={isMobile} />}
        </div>

        {progress < 0.04 && (
          <div style={{ position: 'absolute', bottom: isMobile ? '1.5rem' : '3rem', left: '50%', transform: 'translateX(-50%)', textAlign: 'center', animation: 'scrollPulse 2s ease-in-out infinite' }}>
            <p style={{ fontSize: isMobile ? '0.62rem' : '0.8rem', color: '#6a8a6a', fontWeight: 600, marginBottom: '0.5rem' }}>Role para abrir o livro</p>
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
        @keyframes bookFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes bookPulse { 0%,100% { transform: scale(1); opacity:0.35; } 50% { transform: scale(1.35); opacity:0.7; } }
        @keyframes bookRing { 0% { transform: scale(0.85); opacity:0.2; } 70% { transform: scale(1.15); opacity:0.05; } 100% { transform: scale(1.2); opacity:0; } }
      `}</style>
    </div>
  );
}

function FlippingBook({ currentPageIndex, flipFraction, isMobile = false, isTablet = false }) {
  const isFlipping = flipFraction > 0.01 && currentPageIndex < TOTAL - 1;
  const angle = isFlipping ? easeInOutCubic(flipFraction) * 180 : 0;

  const nextPageIndex = Math.min(currentPageIndex + 1, TOTAL - 1);
  const currentPage = CHAPTERS[currentPageIndex];
  const nextPage = CHAPTERS[nextPageIndex];

  const fold = Math.sin((angle * Math.PI) / 180);
  const curveX = fold * 6;
  const foldShade = fold * 0.22;
  const bookRadius = isMobile ? '6px 14px 14px 6px' : isTablet ? '8px 18px 18px 8px' : '10px 22px 22px 10px';
  const bookShadow = isMobile
    ? '0 18px 40px rgba(0,0,0,0.35)'
    : isTablet
      ? '0 22px 50px rgba(0,0,0,0.38)'
      : '0 28px 60px rgba(0,0,0,0.42), 0 8px 18px rgba(0,0,0,0.22)';

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', borderRadius: bookRadius, overflow: 'hidden', boxShadow: bookShadow, background: '#0a120c' }}>
      {/* Next page (revealed underneath) */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
        <CinematicPage chapter={nextPage} isMobile={isMobile} />
      </div>

      {/* Current page (under the flipping leaf, left half stays) */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 2, overflow: 'hidden' }}>
        <CinematicPage chapter={currentPage} isMobile={isMobile} />
        {/* right half gets covered by the leaf; keep full page for left static half */}
      </div>

      {/* Spine */}
      <div
        style={{
          position: 'absolute', top: 0, bottom: 0, left: '50%', width: 10, marginLeft: -5,
          background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.22) 45%, rgba(255,255,255,0.05) 55%, transparent)',
          zIndex: 30, pointerEvents: 'none',
        }}
      />

      {/* Flipping leaf */}
      {isFlipping && (
        <div style={{
          position: 'absolute', top: 0, left: '50%', width: '50%', height: '100%',
          transformOrigin: 'left center',
          transform: `rotateY(${-angle}deg) rotateX(${curveX}deg)`,
          transformStyle: 'preserve-3d',
          zIndex: angle > 90 ? 8 : 40,
          willChange: 'transform',
        }}>
          {/* Front: current page right half */}
          <div style={{
            position: 'absolute', inset: 0,
            backfaceVisibility: 'hidden',
            overflow: 'hidden',
            borderRadius: `0 ${isMobile ? 12 : 18}px ${isMobile ? 12 : 18}px 0`,
            boxShadow: `inset 12px 0 24px rgba(0,0,0,${foldShade})`,
          }}>
            <div style={{ position: 'absolute', top: 0, left: '-100%', width: '200%', height: '100%' }}>
              <CinematicPage chapter={currentPage} isMobile={isMobile} />
            </div>
            <div style={{
              position: 'absolute', top: 0, left: 0, bottom: 0, width: isMobile ? 28 : 48,
              background: `linear-gradient(90deg, rgba(0,0,0,${foldShade + 0.08}), transparent)`,
              pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute', top: 0, left: 0, bottom: 0, width: isMobile ? 8 : 14,
              background: `linear-gradient(90deg, rgba(255,255,255,${0.04 + foldShade * 0.15}), transparent)`,
              pointerEvents: 'none',
            }} />
          </div>

          {/* Back: next page right half (mirrored) */}
          <div style={{
            position: 'absolute', inset: 0,
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            overflow: 'hidden',
            borderRadius: `${isMobile ? 12 : 18}px 0 0 ${isMobile ? 12 : 18}px`,
            boxShadow: `inset -12px 0 24px rgba(0,0,0,${foldShade})`,
          }}>
            <div style={{ position: 'absolute', top: 0, left: '-100%', width: '200%', height: '100%', transform: 'scaleX(-1)' }}>
              <CinematicPage chapter={nextPage} isMobile={isMobile} />
            </div>
            <div style={{
              position: 'absolute', top: 0, right: 0, bottom: 0, width: isMobile ? 28 : 48,
              background: `linear-gradient(270deg, rgba(0,0,0,${foldShade + 0.08}), transparent)`,
              pointerEvents: 'none',
            }} />
          </div>
        </div>
      )}

      {/* Dynamic cast shadow on the page being revealed */}
      {isFlipping && angle > 3 && angle < 177 && (
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `${50 + fold * 18}%`,
          width: '22%',
          background: `linear-gradient(270deg, rgba(0,0,0,${fold * 0.22}), transparent 85%)`,
          pointerEvents: 'none',
          zIndex: 12,
        }} />
      )}
    </div>
  );
}

function ClosedBook({ scale = 1, isMobile = false }) {
  const bookRadius = isMobile ? '6px 14px 14px 6px' : '10px 22px 22px 10px';
  const bookShadow = isMobile
    ? '10px 12px 28px rgba(0,0,0,0.28)'
    : '16px 18px 44px rgba(0,0,0,0.35), 6px 8px 16px rgba(0,0,0,0.18)';

  return (
    <div style={{ width: '100%', height: '100%', transformStyle: 'preserve-3d', transform: isMobile ? 'rotateX(3deg) rotateY(-12deg)' : 'rotateX(5deg) rotateY(-18deg)' }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: bookRadius, overflow: 'hidden', boxShadow: bookShadow }}>
        <CoverFace isMobile={isMobile} />
      </div>
      <div style={{ position: 'absolute', bottom: isMobile ? -8 : -16, left: '8%', right: '-3%', height: isMobile ? 12 : 20, background: 'radial-gradient(ellipse, rgba(0,0,0,0.12) 0%, transparent 70%)', filter: 'blur(5px)', borderRadius: '50%' }} />
    </div>
  );
}

function OpeningBook({ progress, scale = 1, isMobile = false }) {
  const bookRadius = isMobile ? '6px 14px 14px 6px' : '10px 22px 22px 10px';
  return (
    <div style={{ width: '100%', height: '100%', transformStyle: 'preserve-3d', transform: `rotateX(${5 - progress * 20}deg) rotateY(${-18 + progress * 120}deg)` }}>
      <div style={{ position: 'absolute', inset: 0, transformOrigin: 'left center', backfaceVisibility: 'hidden', borderRadius: bookRadius, overflow: 'hidden', boxShadow: '0 12px 30px rgba(0,0,0,0.28)' }}>
        <CoverFace isMobile={isMobile} />
      </div>
      <div style={{ position: 'absolute', inset: 0, background: '#1B5E20', borderRadius: bookRadius, zIndex: -1 }} />
    </div>
  );
}

function ClosingBook({ progress, scale = 1, isMobile = false }) {
  const t = (progress - 0.92) / 0.08;
  const bookRadius = isMobile ? '6px 14px 14px 6px' : '10px 22px 22px 10px';
  return (
    <div style={{ width: '100%', height: '100%', transformStyle: 'preserve-3d', transform: `rotateX(${4 + t * 60}deg) rotateY(${t * -200}deg)` }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: bookRadius, overflow: 'hidden', boxShadow: '0 16px 40px rgba(0,0,0,0.32)' }}>
        <CoverFace isMobile={isMobile} />
      </div>
    </div>
  );
}

function CoverFace({ isMobile = false }) {
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
```

- [ ] **Step 2: Run unit tests still green**

Run: `npx vitest run src/test/interactive-book.test.js`
Expected: PASS

- [ ] **Step 3: Production build check**

Run: `npm run build:web`
Expected: build succeeds, no import errors

- [ ] **Step 4: Commit**

```bash
git add src/components/InteractiveBook.jsx
git commit -m "feat(landing): cinematic book pages with improved 3D page flip"
```

---

### Task 4: Visual smoke in dev server

**Covers:** end-to-end look of the book on the landing page

**Files:**
- None (verification only). Optional: screenshot into `prints/` (gitignored).

**Interfaces:**
- Consumes: running `npm run dev`

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Expected: Vite on http://localhost:5173 (or reported port)

- [ ] **Step 2: Open landing `#book` and scroll through chapters**

Use Playwright CLI (or manual browser):
1. Open `/`
2. Scroll to `#book`
3. Continue scrolling slowly through open/close
4. Confirm: cover opens → 8 cinematic chapters flip → closes
5. Confirm no broken images / no `system-screenshots` requests for book pages

- [ ] **Step 3: Mobile viewport check**

Viewport 412×914, same scroll pass. Text must remain readable; flip must not overflow badly.

- [ ] **Step 4: Fix any visual regressions found, re-run tests**

Run: `npx vitest run src/test/interactive-book.test.js`
Expected: PASS

- [ ] **Step 5: Commit fixes if any**

```bash
git add -A
git commit -m "fix(landing): polish cinematic book visuals"
```

---

## Out of scope (explicit)

- Replacing `ScrollCarousel` “Veja o sistema em ação” images with live app screenshots (deferred; needs credentials).
- Any auth, Supabase, or API changes.
- Mobile app / Capacitor packaging.
