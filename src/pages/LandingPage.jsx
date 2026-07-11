import { useState, useEffect, useRef, useCallback } from 'react';
import {
  BookOpen, BookMarked, RefreshCw, Bell, Building2, BarChart3,
  FileText, Lightbulb, Palette, Trophy,
  Medal, Star, Crown, GraduationCap, Mail,
  MessageCircle, Phone, Heart, Zap, Sparkles,
  ArrowRight, Users, Award, Target,
  CheckCircle2, Shield, Play, MessageSquare,
  Headphones, CalendarCheck, TrendingUp, Lock,
  Smartphone, Wifi, AlertTriangle, Send,
} from 'lucide-react';
import InteractiveBook from '../components/InteractiveBook';
import ScrollCarousel from '../components/ScrollCarousel';
import PaperStack from '../components/PaperStack';
import SolutionShowcase from '../components/SolutionShowcase';
import { trackClick, trackSection, trackForm } from '@/hooks/useAnalytics';

/* ─── hooks ─── */
function useScrollY() {
  const [y, setY] = useState(0);
  useEffect(() => {
    const onScroll = () => setY(window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return y;
}

function useInView(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); io.disconnect(); } },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, visible];
}

function useMouse() {
  const [pos, setPos] = useState({ x: -999, y: -999 });
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches === false) return;
    const onMove = (e) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);
  return pos;
}

/* ─── Magnetic Button ─── */
function MagneticButton({ children, className = '', href, style: styleProp = {}, ...props }) {
  const ref = useRef(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const handleMove = useCallback((e) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setOffset({
      x: (e.clientX - rect.left - rect.width / 2) * 0.3,
      y: (e.clientY - rect.top - rect.height / 2) * 0.3,
    });
  }, []);
  const handleLeave = useCallback(() => setOffset({ x: 0, y: 0 }), []);
  const Tag = href ? 'a' : 'button';
  return (
    <Tag ref={ref} href={href} className={className} onMouseMove={handleMove} onMouseLeave={handleLeave}
      style={{ ...styleProp, transform: `translate(${offset.x}px, ${offset.y}px)`, transition: 'transform 0.25s cubic-bezier(0.23,1,0.32,1)' }} {...props}>
      {children}
    </Tag>
  );
}

/* ─── Reveal Section ─── */
function RevealSection({ children, className = '', style = {}, direction = 'up', delay = 0 }) {
  const [ref, visible] = useInView(0.1);
  const transforms = {
    up: visible ? 'translateY(0)' : 'translateY(60px)',
    down: visible ? 'translateY(0)' : 'translateY(-60px)',
    left: visible ? 'translateX(0)' : 'translateX(-80px)',
    right: visible ? 'translateX(0)' : 'translateX(80px)',
    scale: visible ? 'scale(1)' : 'scale(0.85)',
  };
  return (
    <div ref={ref} className={className} style={{
      ...style,
      opacity: visible ? 1 : 0,
      transform: transforms[direction],
      transition: `opacity 0.8s cubic-bezier(0.23,1,0.32,1) ${delay}s, transform 0.8s cubic-bezier(0.23,1,0.32,1) ${delay}s`,
    }}>
      {children}
    </div>
  );
}

/* ─── Glow Card ─── */
function GlowCard({ children, color = '#43A047', className = '', style = {}, delay = 0 }) {
  const [ref, visible] = useInView(0.15);
  const [hover, setHover] = useState(false);
  return (
    <div ref={ref} className={className}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        ...style,
        opacity: visible ? 1 : 0,
        transform: visible ? (hover ? 'translateY(-8px) scale(1.02)' : 'translateY(0) scale(1)') : 'translateY(50px) scale(0.95)',
        transition: `all 0.6s cubic-bezier(0.23,1,0.32,1) ${delay}s`,
        boxShadow: hover ? `0 20px 60px ${color}20, 0 0 40px ${color}10` : `0 4px 20px rgba(0,0,0,0.1)`,
      }}>
      {children}
    </div>
  );
}

/* ─── Floating Decorations ─── */
function FloatingDecor({ shapes = [] }) {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {shapes.map((s, i) => (
        <div key={i} style={{
          position: 'absolute', left: s.x, top: s.y, width: s.size, height: s.size,
          borderRadius: s.circle ? '50%' : s.r || 4,
          background: s.bg || `rgba(67,160,71,0.05)`,
          border: s.border || 'none',
          animation: `floatDecor${i % 3} ${8 + i * 2}s ease-in-out ${i * 0.5}s infinite alternate`,
          transform: `rotate(${s.rot || 0}deg)`,
        }} />
      ))}
    </div>
  );
}

/* ─── Reveal Text ─── */
function RevealText({ children, className = '', delay = 0, as: Tag = 'span', style = {} }) {
  const [ref, visible] = useInView(0.2);
  const words = children.split(' ');
  return (
    <Tag ref={ref} className={className} style={style}>
      {words.map((w, i) => (
        <span key={i} style={{ display: 'inline-block', overflow: 'hidden' }}>
          <span style={{ display: 'inline-block', transform: visible ? 'translateY(0)' : 'translateY(110%)', transition: `transform 0.7s cubic-bezier(0.23,1,0.32,1) ${delay + i * 0.05}s` }}>
            {w}&nbsp;
          </span>
        </span>
      ))}
    </Tag>
  );
}

/* ─── Parallax ─── */
function Parallax({ children, speed = 0.15, className = '' }) {
  const scrollY = useScrollY();
  const ref = useRef(null);
  const [top, setTop] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
    const update = () => { if (ref.current) setTop(ref.current.getBoundingClientRect().top + window.scrollY); };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  if (isMobile) return <div ref={ref} className={className}>{children}</div>;
  return <div ref={ref} className={className} style={{ transform: `translateY(${(scrollY - top) * speed}px)` }}>{children}</div>;
}

/* ─── Floating Letters (book-themed background) ─── */
function FloatingLetters() {
  const letters = [
    { char: 'A', x: 5, y: 12, size: 80, rot: -15, delay: 0 },
    { char: 'B', x: 88, y: 8, size: 60, rot: 12, delay: 0.5 },
    { char: 'Σ', x: 15, y: 55, size: 70, rot: -8, delay: 1 },
    { char: 'Ω', x: 82, y: 45, size: 55, rot: 20, delay: 1.5 },
    { char: 'φ', x: 50, y: 30, size: 65, rot: -25, delay: 0.8 },
    { char: 'λ', x: 92, y: 70, size: 50, rot: 10, delay: 2 },
    { char: 'π', x: 8, y: 80, size: 72, rot: -5, delay: 0.3 },
    { char: 'α', x: 70, y: 15, size: 48, rot: 18, delay: 1.2 },
    { char: 'θ', x: 35, y: 75, size: 58, rot: -20, delay: 0.7 },
    { char: '∞', x: 60, y: 60, size: 45, rot: 8, delay: 1.8 },
    { char: '§', x: 25, y: 35, size: 62, rot: -12, delay: 0.2 },
    { char: 'Δ', x: 75, y: 82, size: 52, rot: 15, delay: 1.4 },
    { char: 'ε', x: 42, y: 90, size: 40, rot: -18, delay: 0.9 },
    { char: 'ζ', x: 12, y: 25, size: 55, rot: 22, delay: 2.2 },
    { char: 'μ', x: 95, y: 30, size: 42, rot: -10, delay: 1.6 },
  ];
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
      {letters.map((l, i) => (
        <div key={i} style={{
          position: 'absolute', left: `${l.x}%`, top: `${l.y}%`,
          transform: `rotate(${l.rot}deg)`,
          animation: `letterFloat ${6 + i * 0.7}s ease-in-out ${l.delay}s infinite alternate`,
        }}>
          <span style={{
            fontSize: l.size, fontFamily: "'Space Grotesk', Georgia, serif",
            fontWeight: 100, color: 'rgba(67,160,71,0.12)',
            userSelect: 'none', lineHeight: 1, display: 'block',
          }}>{l.char}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Canvas Grain ─── */
function GrainOverlay() {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches === false) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    const draw = () => {
      const w = canvas.width, h = canvas.height;
      const img = ctx.createImageData(w, h);
      const d = img.data;
      for (let i = 0; i < d.length; i += 16) { const v = Math.random() * 255; d[i] = v; d[i+1] = v; d[i+2] = v; d[i+3] = 10; }
      ctx.putImageData(img, 0, 0);
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9998, mixBlendMode: 'overlay' }} />;
}

/* ─── Counter ─── */
function Counter({ target, suffix = '' }) {
  const [ref, visible] = useInView(0.5);
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!visible) return;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min((now - start) / 2200, 1);
      setCount(Math.floor(target * (1 - Math.pow(1 - p, 4))));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [visible, target]);
  return <span ref={ref}>{count.toLocaleString('pt-BR')}{suffix}</span>;
}

/* ─── Stagger Group ─── */
function StaggerGroup({ children, className = '', style = {} }) {
  const [ref, visible] = useInView(0.1);
  const items = Array.isArray(children) ? children : [children];
  return (
    <div ref={ref} className={className} style={style}>
      {items.map((child, i) => (
        <div key={i} style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(40px)', transition: `all 0.7s cubic-bezier(0.23,1,0.32,1) ${i * 0.1}s` }}>
          {child}
        </div>
      ))}
    </div>
  );
}

/* ─── IconBox ─── */
function IconBox({ icon, size = 44, color = '#2E7D32', bg }) {
  return (
    <div style={{
      width: size, height: size, minWidth: size, borderRadius: size * 0.28,
      background: bg || `linear-gradient(135deg, ${color}18, ${color}08)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', color,
    }}>{icon}</div>
  );
}

/* ═══════════════════════════════════════════════
   LANDING PAGE
   ═══════════════════════════════════════════════ */
export default function LandingPage() {
  const scrollY = useScrollY();
  const mouse = useMouse();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('');

  useEffect(() => {
    const sections = document.querySelectorAll('[data-section]');
    const io = new IntersectionObserver(
      (entries) => { entries.forEach((e) => { if (e.isIntersecting) setActiveSection(e.target.dataset.section); }); },
      { threshold: 0.3 }
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  const navLinks = [
    { label: 'Sistema', href: '#book' },
    { label: 'Problema', href: '#problema' },
    { label: 'Solucao', href: '#solucao' },
    { label: 'Diferenciais', href: '#diferenciais' },
    { label: 'Resultados', href: '#resultados' },
    { label: 'Como Funciona', href: '#como' },
    { label: 'Contato', href: '#contato' },
  ];

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#0a1a0d', color: '#e8f5e9' }}>
      <FloatingLetters />
      <GrainOverlay />

      <div style={{
        position: 'fixed', left: mouse.x, top: mouse.y, width: 500, height: 500,
        borderRadius: '50%', pointerEvents: 'none', zIndex: 9997,
        background: 'radial-gradient(circle, rgba(67,160,71,0.08) 0%, transparent 70%)',
        transform: 'translate(-50%, -50%)', transition: 'left 0.15s, top 0.15s',
        display: mouse.x < 0 ? 'none' : 'block',
      }} />

      {/* ═══ NAVBAR ═══ */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
        padding: scrollY > 80 ? '0.7rem 1.5rem' : '1rem 1.5rem',
        background: scrollY > 80 ? 'rgba(10,26,13,0.9)' : 'transparent',
        backdropFilter: scrollY > 80 ? 'blur(24px) saturate(1.8)' : 'none',
        borderBottom: scrollY > 80 ? '1px solid rgba(67,160,71,0.1)' : '1px solid transparent',
        transition: 'all 0.4s cubic-bezier(0.23,1,0.32,1)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <a href="#" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', fontFamily: "'Space Grotesk', system-ui, sans-serif", fontWeight: 700, fontSize: '1.3rem', color: '#43A047', letterSpacing: '-0.02em' }}>
          <svg width="32" height="32" viewBox="0 0 256 256" fill="none">
            <defs><linearGradient id="lg" x1="24" y1="20" x2="232" y2="236"><stop stopColor="#43A047"/><stop offset="1" stopColor="#2E7D32"/></linearGradient></defs>
            <rect x="16" y="16" width="224" height="224" rx="56" fill="url(#lg)"/>
            <path d="M74 66C74 60.477 78.477 56 84 56H158C172.359 56 184 67.641 184 82V177C184 182.523 179.523 187 174 187H102C86.536 187 74 174.464 74 159V66Z" fill="#fff" fillOpacity="0.94"/>
            <path d="M92 85C92 82.791 93.791 81 96 81H159C161.209 81 163 82.791 163 85V87C163 89.209 161.209 91 159 91H96C93.791 91 92 89.209 92 87V85Z" fill="#2E7D32" fillOpacity="0.85"/>
            <circle cx="170" cy="169" r="27" fill="#fff"/>
            <path d="M158 169h24M170 157v24" stroke="#2E7D32" strokeWidth="8" strokeLinecap="round"/>
          </svg>
          BibliotecAI
        </a>

        <div className="hidden md:flex" style={{ alignItems: 'center', gap: '1.2rem' }}>
          {navLinks.map((l) => (
            <a key={l.href} href={l.href} style={{
              textDecoration: 'none', fontWeight: 700, fontSize: '0.9rem',
              color: activeSection === l.href.slice(1) ? '#43A047' : 'rgba(200,230,201,0.6)',
              position: 'relative', padding: '0.3rem 0', transition: 'color 0.3s',
            }}>
              {l.label}
              <span style={{ position: 'absolute', bottom: 0, left: 0, height: 2, borderRadius: 2, background: '#43A047', width: activeSection === l.href.slice(1) ? '100%' : '0%', transition: 'width 0.3s cubic-bezier(0.23,1,0.32,1)' }} />
            </a>
          ))}
        </div>

        <div className="hidden md:flex" style={{ alignItems: 'center', gap: '0.6rem' }}>
          <a href="/auth" onClick={() => trackClick('nav_entrar')} style={{
            padding: '0.6rem 1.4rem', background: 'transparent', color: '#43A047',
            border: '1px solid rgba(67,160,71,0.25)', borderRadius: 50, fontWeight: 800,
            fontSize: '0.88rem', cursor: 'pointer', textDecoration: 'none', transition: 'all 0.3s',
          }}>Entrar</a>
          <MagneticButton href="#contato" onClick={() => trackClick('nav_fale_conosco')} style={{
            padding: '0.6rem 1.6rem', background: 'linear-gradient(135deg, #2E7D32, #43A047)',
            color: '#fff', border: 'none', borderRadius: 50, fontWeight: 800, fontSize: '0.9rem',
            cursor: 'pointer', textDecoration: 'none', boxShadow: '0 4px 20px rgba(46,125,50,0.3)',
          }}>Fale Conosco</MagneticButton>
        </div>

        <button onClick={() => setMenuOpen(true)} className="md:hidden flex"
          style={{ background: 'rgba(67,160,71,0.1)', border: '1px solid rgba(67,160,71,0.2)', cursor: 'pointer', padding: '0.5rem 0.75rem', alignItems: 'center', gap: 6, borderRadius: 10 }} aria-label="Menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#43A047" strokeWidth="2.5" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#43A047', letterSpacing: '0.05em' }}>Menu</span>
        </button>
      </nav>

      {menuOpen && (
        <div className="md:hidden" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1100,
        }}>
          <div onClick={() => setMenuOpen(false)} style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
            opacity: menuOpen ? 1 : 0, transition: 'opacity 0.3s ease',
          }} />
          <div style={{
            position: 'absolute', top: 0, left: 0, bottom: 0, width: '78%', maxWidth: 320,
            background: 'linear-gradient(175deg, #0d1a10 0%, #0a1a0d 50%, #081409 100%)',
            boxShadow: '4px 0 30px rgba(0,0,0,0.5)',
            transform: menuOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.35s cubic-bezier(0.23,1,0.32,1)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: 22, width: 1, background: 'rgba(67,160,71,0.1)' }} />
            <div style={{ position: 'absolute', inset: 6, border: '1px solid rgba(67,160,71,0.08)', borderRadius: '3px 10px 10px 3px', pointerEvents: 'none' }} />
            <div style={{ padding: '1.2rem 1rem 0.8rem', borderBottom: '1px solid rgba(67,160,71,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <svg width="22" height="22" viewBox="0 0 256 256" fill="none">
                  <defs><linearGradient id="lgMobile" x1="24" y1="20" x2="232" y2="236"><stop stopColor="#43A047"/><stop offset="1" stopColor="#2E7D32"/></linearGradient></defs>
                  <rect x="16" y="16" width="224" height="224" rx="56" fill="url(#lgMobile)"/>
                  <path d="M74 66C74 60.477 78.477 56 84 56H158C172.359 56 184 67.641 184 82V177C184 182.523 179.523 187 174 187H102C86.536 187 74 174.464 74 159V66Z" fill="#fff" fillOpacity="0.94"/>
                  <circle cx="170" cy="169" r="27" fill="#fff"/>
                  <path d="M158 169h24M170 157v24" stroke="#2E7D32" strokeWidth="8" strokeLinecap="round"/>
                </svg>
                <span style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontWeight: 700, fontSize: '0.95rem', color: '#43A047', letterSpacing: '-0.02em' }}>BibliotecAI</span>
              </div>
              <button onClick={() => setMenuOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(200,230,201,0.5)" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.6rem 0' }}>
              {navLinks.map((l, i) => (
                <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)} style={{
                  textDecoration: 'none', fontWeight: 700, fontSize: '0.92rem', color: 'rgba(200,230,201,0.6)',
                  padding: '0.75rem 1.5rem', minHeight: 48, display: 'flex', alignItems: 'center', gap: '0.6rem',
                  fontFamily: "'DM Sans', system-ui, sans-serif", transition: 'all 0.2s',
                  borderBottom: '1px solid rgba(67,160,71,0.06)',
                }}
                onTouchEnd={() => setMenuOpen(false)}>
                  <span style={{ fontSize: '0.65rem', color: 'rgba(67,160,71,0.5)', fontWeight: 600, minWidth: 20 }}>0{i + 1}</span>
                  {l.label}
                </a>
              ))}
            </div>
            <div style={{ padding: '1rem 1.5rem 1.2rem', borderTop: '1px solid rgba(67,160,71,0.1)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <a href="/auth" onClick={() => { setMenuOpen(false); trackClick('mobile_entrar'); }} style={{
                padding: '0.75rem 1.5rem', background: 'transparent', color: '#43A047',
                border: '1px solid rgba(67,160,71,0.25)', borderRadius: 50, fontWeight: 800,
                fontSize: '0.88rem', cursor: 'pointer', textDecoration: 'none', textAlign: 'center', minHeight: 48,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>Entrar no Sistema</a>
              <MagneticButton href="#contato" onClick={() => setMenuOpen(false)} style={{
                padding: '0.75rem 1.5rem', background: 'linear-gradient(135deg, #1B5E20, #2E7D32)',
                color: '#fff', border: 'none', borderRadius: 50, fontWeight: 800, fontSize: '0.88rem',
                cursor: 'pointer', textDecoration: 'none', boxShadow: '0 4px 20px rgba(46,125,50,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 48, gap: '0.4rem',
              }}>
                <Mail size={16} /> Fale Conosco
              </MagneticButton>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ HERO ═══════════ */}
      <section data-section="hero" style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '6rem 1.5rem 4rem' }}>
        {/* Cinematic background */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #0a1a0d 0%, #0d2612 25%, #132e18 50%, #0a1a0d 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, opacity: 0.03, backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)', backgroundSize: '40px 40px' }} />

        {/* Cinematic light beams */}
        <div style={{ position: 'absolute', top: '-20%', right: '-5%', width: '60vw', height: '120vh', background: 'linear-gradient(180deg, rgba(46,125,50,0.12) 0%, rgba(46,125,50,0.03) 40%, transparent 70%)', transform: 'rotate(-12deg)', filter: 'blur(60px)' }} />
        <div style={{ position: 'absolute', top: '10%', left: '-10%', width: '40vw', height: '80vh', background: 'linear-gradient(180deg, rgba(249,168,37,0.06) 0%, transparent 60%)', transform: 'rotate(8deg)', filter: 'blur(80px)' }} />

        {/* Horizontal cinematic line */}
        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(46,125,50,0.15), rgba(67,160,71,0.2), rgba(46,125,50,0.15), transparent)', opacity: scrollY > 100 ? 0 : 1, transition: 'opacity 0.6s' }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 900, margin: '0 auto', width: '100%' }}>
          {/* Top line */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem', opacity: 0, animation: 'fadeUp 1s ease-out 0.2s forwards' }}>
            <div style={{ width: 40, height: 1, background: 'linear-gradient(90deg, #43A047, transparent)' }} />
            <span style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontSize: '0.72rem', fontWeight: 600, color: 'rgba(67,160,71,0.7)', textTransform: 'uppercase', letterSpacing: '0.25em' }}>Plataforma de gestao bibliotecaria</span>
          </div>

          {/* Main heading - editorial style */}
          <h1 style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontSize: 'clamp(2.8rem, 8vw, 5.5rem)', fontWeight: 700, lineHeight: 0.95, letterSpacing: '-0.05em', color: '#e8f5e9', marginBottom: '2rem', opacity: 0, animation: 'fadeUp 1s ease-out 0.4s forwards' }}>
            <span style={{ display: 'block', opacity: 0.4 }}>A biblioteca</span>
            <span style={{ display: 'block', marginTop: '0.1em' }}>
              que <span style={{ fontStyle: 'italic', fontWeight: 400, color: '#43A047' }}>transforma</span>
            </span>
            <span style={{ display: 'block', marginTop: '0.1em', color: 'rgba(232,245,233,0.3)' }}>leitores.</span>
          </h1>

          {/* Subtitle */}
          <p style={{ fontSize: 'clamp(1rem, 1.8vw, 1.2rem)', color: 'rgba(200,230,201,0.5)', lineHeight: 1.8, maxWidth: 480, marginBottom: '3rem', fontWeight: 400, opacity: 0, animation: 'fadeUp 1s ease-out 0.6s forwards' }}>
            Gerencie acervo, emprestimos e comunicados.
            Alunos ganham XP, resolvem quizzes por IA
            e descobrem o prazer de ler.
          </p>

          {/* CTA row */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', opacity: 0, animation: 'fadeUp 1s ease-out 0.8s forwards' }}>
            <MagneticButton href="#contato" onClick={() => trackClick('hero_cta_demonstracao')} style={{
              padding: '1rem 2.2rem', background: '#43A047',
              color: '#fff', border: 'none', borderRadius: 4, fontWeight: 700, fontSize: '0.88rem',
              cursor: 'pointer', textDecoration: 'none', fontFamily: "'Space Grotesk', system-ui, sans-serif",
              boxShadow: '0 0 40px rgba(67,160,71,0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', minHeight: 48,
              letterSpacing: '-0.01em', transition: 'all 0.3s cubic-bezier(0.23,1,0.32,1)',
            }}>
              Demonstracao gratuita <ArrowRight size={16} />
            </MagneticButton>
            <MagneticButton href="#solucao" onClick={() => trackClick('hero_cta_como_funciona')} style={{
              padding: '1rem 2.2rem', background: 'transparent',
              color: 'rgba(200,230,201,0.7)', border: '1px solid rgba(67,160,71,0.2)', borderRadius: 4,
              fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer', textDecoration: 'none',
              fontFamily: "'Space Grotesk', system-ui, sans-serif", display: 'inline-flex', alignItems: 'center',
              justifyContent: 'center', gap: '0.5rem', minHeight: 48, letterSpacing: '-0.01em',
              transition: 'all 0.3s cubic-bezier(0.23,1,0.32,1)',
            }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(67,160,71,0.5)'; e.currentTarget.style.color = '#c8e6c9'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(67,160,71,0.2)'; e.currentTarget.style.color = 'rgba(200,230,201,0.7)'; }}>
              <Play size={16} /> Ver como funciona
            </MagneticButton>
          </div>

          {/* 3D Book */}
          <div className="hero-book-wrapper" style={{ position: 'absolute', top: '38%', right: '-10%', transform: 'translateY(-55%)', perspective: '1200px', opacity: 0, animation: 'fadeUp 1.2s ease-out 0.6s forwards', pointerEvents: 'none' }}>
            <div style={{ animation: 'bookFloat 5s ease-in-out infinite, bookGlow 4s ease-in-out infinite' }}>
              <div style={{ width: 340, height: 480, position: 'relative', transformStyle: 'preserve-3d', transform: 'rotateY(-20deg) rotateX(6deg)' }}>

                {/* Ambient glow behind book */}
                <div style={{ position: 'absolute', top: '20%', left: '-20%', width: '140%', height: '80%', background: 'radial-gradient(ellipse, rgba(67,160,71,0.12) 0%, transparent 60%)', filter: 'blur(40px)' }} />

                {/* Shadow */}
                <div style={{ position: 'absolute', bottom: -30, left: '8%', width: '85%', height: 50, background: 'radial-gradient(ellipse, rgba(0,0,0,0.4) 0%, transparent 70%)', filter: 'blur(18px)' }} />

                {/* Pages stack - more pages for realism */}
                {[0,1,2,3,4,5,6,7].map(i => (
                  <div key={i} style={{
                    position: 'absolute',
                    top: 4, left: 16 + i * 1.2, right: 4 - i * 0.3, bottom: 4,
                    background: i < 2 ? (i % 2 === 0 ? '#f5f0e8' : '#ede8df') : (i % 2 === 0 ? '#e8e3da' : '#e0dbd2'),
                    borderRadius: '0 5px 5px 0',
                    boxShadow: i === 0 ? '4px 0 12px rgba(0,0,0,0.15)' : 'none',
                  }} />
                ))}

                {/* Page edges (visible from side) */}
                <div style={{ position: 'absolute', top: 6, left: 16, width: 10, bottom: 6, background: 'repeating-linear-gradient(180deg, #f0ebe3 0px, #f0ebe3 2px, #e5e0d7 2px, #e5e0d7 4px)', borderRadius: '2px 0 0 2px' }} />

                {/* Spine - more detailed */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, width: 18, height: '100%',
                  background: 'linear-gradient(180deg, #143d1c 0%, #1a5226 10%, #2E7D32 30%, #357a3a 50%, #2E7D32 70%, #1a5226 90%, #143d1c 100%)',
                  borderRadius: '8px 0 0 8px',
                  boxShadow: 'inset -4px 0 10px rgba(0,0,0,0.5), 3px 0 8px rgba(0,0,0,0.25)',
                }}>
                  {/* Spine lines */}
                  <div style={{ position: 'absolute', top: '12%', left: 4, right: 4, height: 1, background: 'rgba(255,255,255,0.1)' }} />
                  <div style={{ position: 'absolute', top: '14%', left: 4, right: 4, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                  <div style={{ position: 'absolute', bottom: '12%', left: 4, right: 4, height: 1, background: 'rgba(255,255,255,0.1)' }} />
                  <div style={{ position: 'absolute', bottom: '14%', left: 4, right: 4, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                  {/* Spine text */}
                  <div style={{ position: 'absolute', top: '50%', left: 9, transform: 'translateY(-50%) rotate(-90deg)', whiteSpace: 'nowrap', fontFamily: "'Space Grotesk', system-ui, sans-serif", fontSize: '0.5rem', fontWeight: 600, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>BibliotecAI</div>
                </div>

                {/* Front cover */}
                <div style={{
                  position: 'absolute', top: 0, left: 14, right: 0, bottom: 0,
                  background: 'linear-gradient(155deg, #143d1c 0%, #1B5E20 15%, #2E7D32 35%, #43A047 55%, #2E7D32 75%, #1B5E20 90%, #143d1c 100%)',
                  borderRadius: '0 10px 10px 0',
                  overflow: 'hidden',
                  boxShadow: '6px 6px 30px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.06)',
                }}>

                  {/* Cover texture - canvas feel */}
                  <div style={{ position: 'absolute', inset: 0, opacity: 0.03, backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 1px, rgba(255,255,255,0.4) 1px, rgba(255,255,255,0.4) 2px), repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(255,255,255,0.2) 1px, rgba(255,255,255,0.2) 2px)' }} />

                  {/* Inner border */}
                  <div style={{ position: 'absolute', top: 16, left: 16, right: 16, bottom: 16, border: '1px solid rgba(255,255,255,0.08)', borderRadius: '0 6px 6px 0' }} />

                  {/* Cover content */}
                  <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', padding: '2.2rem 2rem 2rem' }}>

                    {/* Top: Logo + brand */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1.5rem' }}>
                      <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05))', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(4px)' }}>
                        <BookOpen size={24} color="rgba(255,255,255,0.85)" />
                      </div>
                      <div>
                        <div style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontSize: '0.7rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.2em' }}>BibliotecAI</div>
                        <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.25)', marginTop: 2, letterSpacing: '0.05em' }}>v2.0 — 2026</div>
                      </div>
                    </div>

                    {/* Decorative gold line */}
                    <div style={{ width: 50, height: 2, background: 'linear-gradient(90deg, #F9A825, #FDD835, transparent)', borderRadius: 1, marginBottom: '1.2rem' }} />

                    {/* Center: decorative pattern */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.5rem' }}>
                      {/* Abstract book icon */}
                      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.5rem' }}>
                        {[0.7, 1, 0.5].map((h, i) => (
                          <div key={i} style={{ width: 28, height: `${h * 60}px`, background: `rgba(255,255,255,${0.06 + i * 0.02})`, borderRadius: 3, alignSelf: 'flex-end' }} />
                        ))}
                      </div>
                      {/* Text lines */}
                      {[90, 75, 60, 45, 30].map((w, i) => (
                        <div key={i} style={{ height: 2.5, width: `${w}%`, borderRadius: 2, background: `rgba(255,255,255,${0.05 + i * 0.015})` }} />
                      ))}
                    </div>

                    {/* Bottom: Title */}
                    <div>
                      <div style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontSize: '2rem', fontWeight: 700, color: '#fff', lineHeight: 1, letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>
                        Gestao
                      </div>
                      <div style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontSize: '2rem', fontWeight: 400, fontStyle: 'italic', color: '#a5d6a7', lineHeight: 1, letterSpacing: '-0.02em', marginBottom: '0.8rem' }}>
                        Inteligente
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: 32, height: 2, background: '#43A047', borderRadius: 1 }} />
                        <span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Plataforma Digital</span>
                      </div>
                    </div>
                  </div>

                  {/* Edge highlights */}
                  <div style={{ position: 'absolute', top: 0, right: 0, width: 1.5, height: '100%', background: 'linear-gradient(180deg, rgba(255,255,255,0.15), transparent 25%, transparent 75%, rgba(255,255,255,0.1))' }} />
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1.5, background: 'linear-gradient(90deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))' }} />
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, rgba(255,255,255,0.08), transparent 50%)' }} />
                </div>

                {/* Reflection overlay */}
                <div style={{ position: 'absolute', top: 0, left: 14, right: 0, bottom: 0, borderRadius: '0 10px 10px 0', background: 'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.03) 25%, transparent 50%)', pointerEvents: 'none' }} />
              </div>
            </div>
          </div>

          {/* Bottom stats - cinematic strip */}
          <div style={{ marginTop: '4rem', display: 'flex', gap: '3rem', flexWrap: 'wrap', opacity: 0, animation: 'fadeUp 1s ease-out 1s forwards' }}>
            {[
              { value: '264+', label: 'usuarios ativos' },
              { value: '1', label: 'escola em operacao' },
              { value: '24/7', label: 'disponivel' },
            ].map((stat, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                <span style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontSize: '1.5rem', fontWeight: 700, color: '#43A047', letterSpacing: '-0.02em' }}>{stat.value}</span>
                <span style={{ fontSize: '0.78rem', color: 'rgba(200,230,201,0.35)', fontWeight: 500, letterSpacing: '0.02em' }}>{stat.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Cinematic vignette */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 40%, rgba(10,26,13,0.6) 100%)', pointerEvents: 'none' }} />

        {/* Scroll indicator */}
        <div style={{ position: 'absolute', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', opacity: 0, animation: 'fadeUp 1s ease-out 1.2s forwards' }}>
          <span style={{ fontSize: '0.65rem', color: 'rgba(200,230,201,0.3)', textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 600 }}>Scroll</span>
          <div style={{ width: 1, height: 30, background: 'linear-gradient(180deg, rgba(67,160,71,0.4), transparent)', animation: 'scrollDown 2s ease-in-out infinite' }} />
        </div>
      </section>

      {/* ═══ O PROBLEMA ═══ */}
      <TrackedSection name="problema">
        <section data-section="problema" id="problema">
          <PaperStack />
        </section>
      </TrackedSection>

      {/* ═══ A SOLUCAO ═══ */}
      <TrackedSection name="solucao">
        <section data-section="solucao" id="solucao">
          <SolutionShowcase />
        </section>
      </TrackedSection>

      {/* ═══ LIVE BOOK ═══ */}
      <section data-section="book" id="book" style={{ background: '#0a1a0d' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.02, backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)', backgroundSize: '40px 40px', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '-50%', right: '-20%', width: '60vw', height: '100vh', background: 'radial-gradient(ellipse, rgba(46,125,50,0.08) 0%, transparent 60%)', filter: 'blur(60px)', pointerEvents: 'none' }} />
        <div style={{ textAlign: 'center', padding: '5rem 1.5rem 0', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.9rem', background: 'rgba(67,160,71,0.1)', border: '1px solid rgba(67,160,71,0.15)', borderRadius: 50, fontSize: '0.72rem', fontWeight: 700, color: '#43A047', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '1.2rem' }}>
            <BookOpen size={14} /> Conheca o Sistema
          </div>
          <h2 style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontSize: 'clamp(2rem, 3.5vw, 2.8rem)', fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.03em', color: '#e8f5e9' }}>
            Veja o BibliotecAI em acao.
          </h2>
          <p style={{ fontSize: '1rem', color: 'rgba(200,230,201,0.45)', lineHeight: 1.7, marginTop: '1rem', maxWidth: 600, margin: '1rem auto 0' }}>
            Navegue pelo livro interativo e descubra como a plataforma funciona na pratica.
          </p>
        </div>
        <InteractiveBook />
      </section>

      {/* ═══ CAROUSEL ═══ */}
      <section data-section="carousel" id="carousel" style={{ background: '#0a1a0d' }}>
          <ScrollCarousel />
      </section>

      {/* ═══ GAMIFICACAO ═══ */}
      <TrackedSection name="diferenciais">
        <section data-section="gamificacao" id="diferenciais" style={{ padding: '5rem 1.5rem', background: '#0d1a10', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.02, backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        <div style={{ position: 'absolute', top: '50%', left: '-15%', width: '50vw', height: '80vh', background: 'radial-gradient(ellipse, rgba(249,168,37,0.06) 0%, transparent 60%)', filter: 'blur(80px)' }} />
        <FloatingDecor shapes={[
          { x: '8%', y: '15%', size: 12, bg: 'rgba(249,168,37,0.08)', rot: 45 },
          { x: '85%', y: '20%', size: 8, bg: 'rgba(67,160,71,0.08)', circle: true },
          { x: '75%', y: '70%', size: 16, bg: 'rgba(249,168,37,0.05)', rot: 30, border: '1px solid rgba(249,168,37,0.1)' },
          { x: '12%', y: '80%', size: 10, bg: 'rgba(102,187,106,0.06)', circle: true },
        ]} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1100, margin: '0 auto' }}>
          <RevealSection direction="scale" style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.9rem', background: 'rgba(249,168,37,0.08)', border: '1px solid rgba(249,168,37,0.15)', borderRadius: 50, fontSize: '0.72rem', fontWeight: 700, color: '#F9A825', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '1.2rem' }}>
              <Award size={14} /> Gamificacao
            </div>
            <RevealText as="h2" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontSize: 'clamp(2rem, 3.5vw, 2.8rem)', fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.03em', color: '#e8f5e9' }}>
              Leitores que se tornam jogadores.
            </RevealText>
          </RevealSection>

          <StaggerGroup style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
            {[
              { icon: <Trophy size={28} />, title: 'Ranking de XP', desc: 'Alunos acumulam XP a cada leitura. Competem no ranking da turma e da escola.', color: '#43A047', img: '/landing-images/xp-ranking.svg' },
              { icon: <Medal size={28} />, title: 'Niveis e conquistas', desc: 'Sistema de niveis com badges desbloqueaveis. Cada livro lido e um passo na jornada.', color: '#66BB6A', img: '/landing-images/levels-achievements.svg' },
              { icon: <Star size={28} />, title: 'Lista de desejos', desc: 'Alunos marcam livros que querem. O bibliotecador usa a demanda real para guiar compras.', color: '#F9A825', img: '/landing-images/wishlist.svg' },
              { icon: <Target size={28} />, title: 'Desafios diarios com IA', desc: 'A IA gera desafios por dia com bonus de XP por categoria: ciencia, ficcao, HQ.', color: '#4FC3F7', img: '/landing-images/daily-challenges.svg' },
            ].map((card, i) => (
              <GameCard key={i} {...card} dark />
            ))}
          </StaggerGroup>
        </div>
      </section>
      </TrackedSection>

      {/* ═══ COMO FUNCIONA ═══ */}
      <TrackedSection name="como">
      <section data-section="como" id="como" style={{ padding: '5rem 1.5rem', background: '#0a1a0d', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.02, backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        <FloatingDecor shapes={[
          { x: '90%', y: '10%', size: 20, bg: 'rgba(67,160,71,0.06)', rot: 15, border: '1px solid rgba(67,160,71,0.08)' },
          { x: '5%', y: '60%', size: 14, bg: 'rgba(67,160,71,0.05)', circle: true },
          { x: '80%', y: '75%', size: 10, bg: 'rgba(102,187,106,0.06)', rot: 45 },
        ]} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 800, margin: '0 auto' }}>
          <RevealSection direction="up" style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <RevealText as="h2" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontSize: 'clamp(2rem, 3.5vw, 2.8rem)', fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.03em', color: '#e8f5e9' }}>
              Comece a usar em 4 passos.
            </RevealText>
          </RevealSection>
          <div style={{ position: 'relative' }}>
            <RevealSection direction="left" delay={0.2}>
              <div style={{ position: 'absolute', left: 31, top: 0, bottom: 0, width: 3, background: 'linear-gradient(180deg, #2E7D32, #43A047, #66BB6A)', borderRadius: 3, opacity: 0.3 }} />
            </RevealSection>
            {[
              { n: '01', title: 'Cadastre sua escola', desc: 'A gente configura tudo. Sua escola ganha um endereco proprio (escola.bibliotecai.com.br).' },
              { n: '02', title: 'Importe o acervo', desc: 'Cadastre pelo formulario ou importe planilha Excel. A IA classifica automaticamente.' },
              { n: '03', title: 'Convide professores e alunos', desc: 'Gere tokens de acesso por perfil. Cada pessoa cria sua senha e comeca a usar.' },
              { n: '04', title: 'Acompanhe os resultados', desc: 'Dashboards com graficos, rankings ao vivo e relatorios. Veja a leitura crescer.' },
            ].map((step, i) => (
              <StepItem key={i} {...step} index={i} dark />
            ))}
          </div>
        </div>
      </section>
      </TrackedSection>

      {/* ═══ CONFIANCA ═══ */}
      <section data-section="confianca" style={{ padding: '5rem 1.5rem', background: '#0d1a10', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.02, backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        <FloatingDecor shapes={[
          { x: '15%', y: '20%', size: 18, bg: 'rgba(67,160,71,0.06)', circle: true },
          { x: '80%', y: '50%', size: 12, bg: 'rgba(79,195,247,0.06)', rot: 20, border: '1px solid rgba(79,195,247,0.08)' },
          { x: '50%', y: '85%', size: 8, bg: 'rgba(206,147,216,0.06)', circle: true },
        ]} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 900, margin: '0 auto' }}>
          <RevealSection direction="up" style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <RevealText as="h2" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.03em', color: '#e8f5e9' }}>
              Confianca que se prova.
            </RevealText>
          </RevealSection>
          <StaggerGroup style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', textAlign: 'center' }}>
            {[
              { icon: <CheckCircle2 size={28} />, title: 'Funcionando em escola real', desc: '264+ usuarios ativos, incluindo 246 estudantes usando a plataforma no dia a dia.', color: '#43A047' },
              { icon: <Shield size={28} />, title: 'Dados protegidos', desc: 'Armazenamento seguro na nuvem. Nao armazenamos conteudo de livros, apenas dados do acervo.', color: '#4FC3F7' },
              { icon: <Wifi size={28} />, title: 'Funciona offline parcialmente', desc: 'Funcionalidades essenciais disponiveis mesmo com conexao instavel.', color: '#F9A825' },
              { icon: <Lock size={28} />, title: 'LGPD compliance', desc: 'Dados de alunos e escolas tratados com conformidade total com a legislacao brasileira.', color: '#CE93D8' },
            ].map((item, i) => (
              <GlowCard key={i} color={item.color} delay={i * 0.1} style={{ padding: '1.8rem 1.5rem', background: 'rgba(255,255,255,0.03)', border: `1px solid ${item.color}18`, borderRadius: 16, backdropFilter: 'blur(8px)' }}>
                <div style={{ color: item.color, marginBottom: '1rem' }}>{item.icon}</div>
                <h3 style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.5rem', color: '#e8f5e9', letterSpacing: '-0.01em' }}>{item.title}</h3>
                <p style={{ fontSize: '0.82rem', color: 'rgba(200,230,201,0.45)', lineHeight: 1.6 }}>{item.desc}</p>
              </GlowCard>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* ═══ RESULTADOS ═══ */}
      <TrackedSection name="resultados">
      <section data-section="resultados" id="resultados" style={{ padding: '5rem 1.5rem', background: '#0a1a0d', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.02, backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        <div style={{ position: 'absolute', bottom: '-20%', left: '-10%', width: '50vw', height: '60vh', background: 'radial-gradient(ellipse, rgba(46,125,50,0.08) 0%, transparent 60%)', filter: 'blur(60px)' }} />
        <FloatingDecor shapes={[
          { x: '88%', y: '12%', size: 14, bg: 'rgba(67,160,71,0.07)', rot: 30 },
          { x: '8%', y: '75%', size: 20, bg: 'rgba(67,160,71,0.04)', circle: true },
          { x: '70%', y: '80%', size: 10, bg: 'rgba(102,187,106,0.06)', rot: -15, border: '1px solid rgba(102,187,106,0.08)' },
        ]} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1100, margin: '0 auto' }}>
          <RevealSection direction="up" style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.9rem', background: 'rgba(67,160,71,0.1)', border: '1px solid rgba(67,160,71,0.15)', borderRadius: 50, fontSize: '0.72rem', fontWeight: 700, color: '#43A047', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '1.2rem' }}>
              <TrendingUp size={14} /> Resultados Reais
            </div>
            <RevealText as="h2" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontSize: 'clamp(2rem, 3.5vw, 2.8rem)', fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.03em', color: '#e8f5e9' }}>
              Ja esta funcionando de verdade.
            </RevealText>
            <p style={{ fontSize: '1rem', color: 'rgba(200,230,201,0.45)', lineHeight: 1.7, marginTop: '1rem', maxWidth: 600, margin: '1rem auto 0' }}>
              O BibliotecAI nao e so uma ideia. Esta implantado em uma escola piloto com estudantes e profissionais usando no dia a dia.
            </p>
          </RevealSection>

          <StaggerGroup style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
            {[
              { icon: <Users size={32} />, value: '264', label: 'Usuarios ativos', desc: 'Alunos, professores e gestores usando a plataforma', color: '#43A047' },
              { icon: <GraduationCap size={32} />, value: '246', label: 'Estudantes', desc: 'Alunos cadastrados e ativos na plataforma', color: '#66BB6A' },
              { icon: <BookOpen size={32} />, value: '13', label: 'Professores', desc: 'Professores integrados com atividades de leitura', color: '#4FC3F7' },
              { icon: <Building2 size={32} />, value: '1', label: 'Escola piloto', desc: 'Em operacao real validando a solucao', color: '#F9A825' },
            ].map((item, i) => (
              <GlowCard key={i} color={item.color} delay={i * 0.12} style={{ textAlign: 'center', padding: '2rem 1.5rem', background: 'rgba(255,255,255,0.03)', border: `1px solid ${item.color}15`, borderRadius: 16, backdropFilter: 'blur(8px)', cursor: 'default' }}>
                <div style={{ color: item.color, marginBottom: '1rem' }}>{item.icon}</div>
                <div style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontSize: '2.5rem', fontWeight: 700, color: item.color, lineHeight: 1, letterSpacing: '-0.03em' }}>
                  <Counter target={parseInt(item.value)} />
                </div>
                <div style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontWeight: 700, fontSize: '0.95rem', marginTop: '0.5rem', marginBottom: '0.3rem', letterSpacing: '-0.01em', color: '#e8f5e9' }}>{item.label}</div>
                <p style={{ fontSize: '0.82rem', color: 'rgba(200,230,201,0.4)', lineHeight: 1.5 }}>{item.desc}</p>
              </GlowCard>
            ))}
          </StaggerGroup>
        </div>
      </section>
      </TrackedSection>

      {/* ═══ POR QUE ESCOLHER ═══ */}
      <TrackedSection name="porque">
      <section data-section="porque" id="porque" style={{ padding: '5rem 1.5rem', background: '#0d1a10', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.02, backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        <div style={{ position: 'absolute', top: '30%', right: '-10%', width: '40vw', height: '60vh', background: 'radial-gradient(ellipse, rgba(67,160,71,0.06) 0%, transparent 60%)', filter: 'blur(60px)' }} />
        <FloatingDecor shapes={[
          { x: '92%', y: '15%', size: 16, bg: 'rgba(255,138,101,0.05)', rot: 25, border: '1px solid rgba(255,138,101,0.08)' },
          { x: '5%', y: '40%', size: 12, bg: 'rgba(206,147,216,0.05)', circle: true },
          { x: '85%', y: '65%', size: 18, bg: 'rgba(67,160,71,0.04)', rot: -20 },
        ]} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1100, margin: '0 auto' }}>
          <RevealSection direction="up" style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.9rem', background: 'rgba(67,160,71,0.1)', border: '1px solid rgba(67,160,71,0.15)', borderRadius: 50, fontSize: '0.72rem', fontWeight: 700, color: '#43A047', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '1.2rem' }}>
              <Zap size={14} /> Por que o BibliotecAI
            </div>
            <RevealText as="h2" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontSize: 'clamp(2rem, 3.5vw, 2.8rem)', fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.03em', color: '#e8f5e9' }}>
              Com alguma duvida?
            </RevealText>
            <p style={{ marginTop: '1rem', fontSize: '1rem', color: 'rgba(200,230,201,0.45)', lineHeight: 1.7, maxWidth: 600, margin: '1rem auto 0' }}>
              A gente ja pensou por voce. Aqui vai o que mais importa.
            </p>
          </RevealSection>

          <StaggerGroup style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
            {[
              { icon: <Lock size={22} />, title: 'Zero infraestrutura', desc: 'Nao precisa de servidor, equipe de TI ou nada. Abre o navegador e funciona. A gente cuida de tudo.', color: '#43A047' },
              { icon: <Shield size={22} />, title: 'Seus dados protegidos', desc: 'Criptografia de ponta a ponta, conformidade total com LGPD. Nao armazenamos conteudo de livros, apenas metadados.', color: '#4FC3F7' },
              { icon: <Zap size={22} />, title: 'Migracao em minutos', desc: 'Importe sua planilha Excel ou CSV. A IA classifica, organiza e cataloga automaticamente. Sem dor de cabeca.', color: '#F9A825' },
              { icon: <Smartphone size={22} />, title: 'No celular tambem', desc: 'App Android com notificacoes push, chat e comunidade. Funciona em qualquer dispositivo com navegador.', color: '#CE93D8' },
              { icon: <Headphones size={22} />, title: 'Suporte humano de verdade', desc: 'Onboarding guiado, treinamento da equipe e suporte continuo. Voce nunca esta sozinho.', color: '#FF8A65' },
              { icon: <TrendingUp size={22} />, title: 'Resultado desde o primeiro dia', desc: 'Alunos leem mais, bibliotecarias economizam horas, gestores tomam decisoes com dados reais.', color: '#81C784' },
            ].map((item, i) => (
              <GlowCard key={i} color={item.color} delay={i * 0.08} style={{ padding: '1.8rem 1.5rem', background: 'rgba(255,255,255,0.03)', border: `1px solid ${item.color}15`, borderRadius: 16, backdropFilter: 'blur(8px)' }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: `${item.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: item.color, marginBottom: '1.2rem' }}>
                  {item.icon}
                </div>
                <h3 style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontWeight: 700, fontSize: '1.05rem', color: '#e8f5e9', marginBottom: '0.5rem', letterSpacing: '-0.01em' }}>{item.title}</h3>
                <p style={{ fontSize: '0.88rem', color: 'rgba(200,230,201,0.4)', lineHeight: 1.65 }}>{item.desc}</p>
              </GlowCard>
            ))}
          </StaggerGroup>

          <RevealSection direction="up" delay={0.3} style={{ marginTop: '3rem', textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'center', gap: '2.5rem', padding: '1.5rem 2.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: 16, border: '1px solid rgba(67,160,71,0.1)' }}>
              {[
                { value: '100%', label: 'Cloud' },
                { value: '5min', label: 'Setup' },
                { value: '0', label: 'Servidores' },
                { value: '24h', label: 'Suporte' },
              ].map((stat, i) => (
                <div key={i} style={{ textAlign: 'center', minWidth: 80 }}>
                  <div style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontSize: '1.6rem', fontWeight: 700, color: '#43A047', letterSpacing: '-0.02em' }}>{stat.value}</div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(200,230,201,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </RevealSection>
        </div>
      </section>
      </TrackedSection>

      {/* ═══ CONTATO / FORMULARIO ═══ */}
      <ContactForm />

      {/* ═══ FOOTER ═══ */}
      <footer style={{ background: '#060f08', color: 'rgba(200,230,201,0.6)', padding: '3rem 1.5rem 2rem', borderTop: '1px solid rgba(67,160,71,0.08)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '3rem', marginBottom: '3rem' }} className="footer-grid">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: "'Space Grotesk', system-ui, sans-serif", fontWeight: 700, fontSize: '1.2rem', color: '#fff', marginBottom: '0.8rem', letterSpacing: '-0.02em' }}>
              <svg width="28" height="28" viewBox="0 0 256 256" fill="none">
                <defs><linearGradient id="fG" x1="24" y1="20" x2="232" y2="236"><stop stopColor="#43A047"/><stop offset="1" stopColor="#2E7D32"/></linearGradient></defs>
                <rect x="16" y="16" width="224" height="224" rx="56" fill="url(#fG)"/>
                <path d="M74 66C74 60.477 78.477 56 84 56H158C172.359 56 184 67.641 184 82V177C184 182.523 179.523 187 174 187H102C86.536 187 74 174.464 74 159V66Z" fill="#fff" fillOpacity="0.94"/>
                <circle cx="170" cy="169" r="27" fill="#fff"/>
                <path d="M158 169h24M170 157v24" stroke="#2E7D32" strokeWidth="8" strokeLinecap="round"/>
              </svg>
              BibliotecAI
            </div>
            <p style={{ fontSize: '0.88rem', color: 'rgba(240,253,240,0.5)', lineHeight: 1.7, maxWidth: 320, marginBottom: '1rem' }}>
              Plataforma para gestao de bibliotecas escolares com IA, gamificacao e comunicacao integrada. Em operacao real desde 2025.
            </p>
            <p style={{ fontSize: '0.75rem', color: 'rgba(240,253,240,0.3)', lineHeight: 1.5 }}>
              Powered by React, Supabase, Cloudflare &amp; Capacitor
            </p>
          </div>
          {[
            { title: 'Plataforma', links: ['Catalogo de Livros', 'Emprestimos', 'Gamificacao', 'Inteligencia Artificial'] },
            { title: 'Legal', links: ['Politica de Privacidade', 'Termos de Uso'] },
          ].map((col, i) => (
            <div key={i}>
              <h4 style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontWeight: 700, marginBottom: '1rem', fontSize: '0.9rem', color: '#fff', letterSpacing: '-0.01em' }}>{col.title}</h4>
              <ul style={{ listStyle: 'none' }}>
                {col.links.map((link, j) => {
                  const href = link === 'Politica de Privacidade' ? '/privacidade' : '#';
                  return (
                    <li key={j} style={{ marginBottom: '0.5rem' }}>
                      <a href={href} style={{ color: 'rgba(200,230,201,0.4)', textDecoration: 'none', fontSize: '0.85rem', transition: 'color 0.3s' }}
                        onMouseEnter={(e) => e.target.style.color = '#43A047'}
                        onMouseLeave={(e) => e.target.style.color = 'rgba(200,230,201,0.4)'}>{link}</a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <div style={{ maxWidth: 1100, margin: '0 auto', paddingTop: '2rem', borderTop: '1px solid rgba(67,160,71,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', color: 'rgba(200,230,201,0.3)', flexWrap: 'wrap', gap: '0.5rem' }}>
          <span>&copy; 2025-2026 BibliotecAI. Todos os direitos reservados.</span>
          <span>Feito com <Heart size={12} style={{ display: 'inline', verticalAlign: 'middle', color: '#43A047' }} fill="#43A047" /> para a educacao brasileira</span>
        </div>
      </footer>

      <style>{`
        @keyframes morphBlob { 0%, 100% { border-radius: 42% 58% 70% 30% / 45% 45% 55% 55%; transform: rotate(0deg) scale(1); } 25% { border-radius: 58% 42% 45% 55% / 55% 45% 55% 45%; } 50% { border-radius: 45% 55% 58% 42% / 42% 58% 42% 58%; transform: rotate(3deg) scale(1.03); } 75% { border-radius: 55% 45% 42% 58% / 58% 42% 58% 42%; } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes dotPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(1.6); } }
        @keyframes gradientShift { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
        @keyframes scrollDown { 0% { opacity: 1; transform: translateX(-50%) translateY(0); } 100% { opacity: 0; transform: translateX(-50%) translateY(12px); } }
        @keyframes floatBadge { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes bookFloat { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-14px); } }
        @keyframes bookGlow { 0%, 100% { filter: drop-shadow(0 30px 50px rgba(46,125,50,0.3)); } 50% { filter: drop-shadow(0 40px 70px rgba(46,125,50,0.45)); } }
        @keyframes letterFloat { 0% { transform: translateY(0px); opacity: 1; } 100% { transform: translateY(-20px); opacity: 0.6; } }
        @keyframes paperStamp { 0% { transform: scale(3) rotate(-15deg); opacity: 0; } 50% { transform: scale(1.1) rotate(3deg); opacity: 1; } 70% { transform: scale(0.95) rotate(-1deg); } 100% { transform: scale(1) rotate(0deg); opacity: 1; } }
        @keyframes inkSpread { 0% { clip-path: circle(0% at 50% 50%); } 100% { clip-path: circle(100% at 50% 50%); } }
        @keyframes sealPress { 0% { transform: scale(0) rotate(-30deg); opacity: 0; } 60% { transform: scale(1.2) rotate(5deg); opacity: 1; } 80% { transform: scale(0.9) rotate(-2deg); } 100% { transform: scale(1) rotate(0deg); opacity: 1; } }
        @keyframes paperOpen { 0% { transform: scaleY(0.3) rotateX(10deg); opacity: 0; transform-origin: top; } 100% { transform: scaleY(1) rotateX(0deg); opacity: 1; transform-origin: top; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes floatDecor0 { 0% { transform: translateY(0px) rotate(0deg); opacity: 0.4; } 100% { transform: translateY(-30px) rotate(15deg); opacity: 0.7; } }
        @keyframes floatDecor1 { 0% { transform: translateY(0px) rotate(0deg); opacity: 0.3; } 100% { transform: translateY(20px) rotate(-10deg); opacity: 0.6; } }
        @keyframes floatDecor2 { 0% { transform: translateX(0px) rotate(0deg); opacity: 0.35; } 100% { transform: translateX(15px) rotate(8deg); opacity: 0.65; } }
        @keyframes pulseGlow { 0%, 100% { box-shadow: 0 0 20px rgba(67,160,71,0.1); } 50% { box-shadow: 0 0 40px rgba(67,160,71,0.2); } }

        *, *::before, *::after { box-sizing: border-box; }
        html { overflow-x: clip; }

        @media (min-width: 768px) {
          .cta-buttons { flex-direction: row !important; }
          .footer-grid { grid-template-columns: 2fr 1fr 1fr !important; gap: 3rem !important; }
        }
        @media (max-width: 1024px) {
          .hero-book-wrapper { right: -18% !important; top: 42% !important; }
          .hero-book-wrapper > div { transform: scale(0.6) !important; }
        }
        @media (min-width: 1025px) and (max-width: 1280px) {
          .hero-book-wrapper { right: -14% !important; top: 40% !important; }
          .hero-book-wrapper > div { transform: scale(0.8) !important; }
        }

        @media (max-width: 767px) {
          .footer-grid { grid-template-columns: 1fr 1fr !important; gap: 1.5rem !important; }
          .features-asym-grid, .features-asym-grid-reverse { grid-template-columns: 1fr !important; gap: 1rem !important; }
          img[loading="lazy"] { max-width: 180px !important; }
          [data-section="gamificacao"],
          [data-section="como"],
          [data-section="resultados"],
          [data-section="confianca"],
          [data-section="porque"] { padding-top: 2.5rem !important; padding-bottom: 2.5rem !important; }
          [data-section="gamificacao"] [style*="marginBottom: 4rem"],
          [data-section="como"] [style*="marginBottom: 4rem"],
          [data-section="resultados"] [style*="marginBottom: 4rem"] { margin-bottom: 2rem !important; }
        }

        @media (max-width: 480px) {
          .footer-grid { grid-template-columns: 1fr !important; }
          .contact-form-grid { grid-template-columns: 1fr !important; }
          .hero-book-wrapper { display: none !important; }
        }
      `}</style>
    </div>
  );
}

/* ═══ SUB-COMPONENTS ═══ */

function FeatureCard({ icon, title, desc, large, img, dark }) {
  const [ref, visible] = useInView(0.15);
  return (
    <div ref={ref} style={{
      padding: large ? '1.5rem' : '1.2rem', background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.72)',
      border: `1px solid ${dark ? 'rgba(67,160,71,0.12)' : 'rgba(46,125,50,0.1)'}`, borderRadius: 20, backdropFilter: 'blur(12px)',
      transition: 'all 0.5s cubic-bezier(0.23,1,0.32,1)', opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(40px)', cursor: 'default', position: 'relative', overflow: 'hidden',
    }}
    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-6px)'; e.currentTarget.style.boxShadow = '0 20px 60px rgba(46,125,50,0.1)'; e.currentTarget.querySelector('.fc-bar').style.transform = 'scaleX(1)'; }}
    onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.querySelector('.fc-bar').style.transform = 'scaleX(0)'; }}>
      <div className="fc-bar" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #2E7D32, #43A047, #66BB6A)', transform: 'scaleX(0)', transformOrigin: 'left', transition: 'transform 0.5s cubic-bezier(0.23,1,0.32,1)' }} />
      <IconBox icon={icon} size={large ? 48 : 40} />
      <h3 style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontSize: large ? 'clamp(1rem, 2.5vw, 1.25rem)' : 'clamp(0.9rem, 2vw, 1.05rem)', fontWeight: 700, marginBottom: '0.4rem', marginTop: '0.8rem', letterSpacing: '-0.01em', color: dark ? '#e8f5e9' : '#1a2a1a' }}>{title}</h3>
      <p style={{ fontSize: 'clamp(0.78rem, 2vw, 0.9rem)', color: dark ? 'rgba(200,230,201,0.4)' : '#4a6a4a', lineHeight: 1.5 }}>{desc}</p>
    </div>
  );
}

function GameCard({ icon, title, desc, color, img, dark }) {
  const [ref, visible] = useInView(0.15);
  return (
    <div ref={ref} style={{
      textAlign: 'center', padding: '1.5rem 1.2rem', background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.72)',
      border: `1px solid ${color}${dark ? '18' : '08'}`, borderRadius: 20, backdropFilter: 'blur(12px)',
      transition: 'all 0.5s cubic-bezier(0.23,1,0.32,1)', opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0) scale(1)' : 'translateY(30px) scale(0.96)', cursor: 'default', overflow: 'hidden',
    }}
    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-10px) scale(1.02)'; e.currentTarget.style.boxShadow = `0 20px 60px ${color}15`; }}
    onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}>
      <IconBox icon={icon} size={56} color={color} bg={`${color}${dark ? '15' : '10'}`} />
      <h3 style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontWeight: 700, fontSize: 'clamp(0.9rem, 2.5vw, 1.05rem)', marginBottom: '0.3rem', marginTop: '0.6rem', letterSpacing: '-0.01em', color: dark ? '#e8f5e9' : '#1a2a1a' }}>{title}</h3>
      <p style={{ fontSize: 'clamp(0.78rem, 2vw, 0.88rem)', color: dark ? 'rgba(200,230,201,0.4)' : '#5a6a3a', lineHeight: 1.5 }}>{desc}</p>
    </div>
  );
}

function StepItem({ n, title, desc, index, dark }) {
  const [ref, visible] = useInView(0.2);
  return (
    <div ref={ref} className="step-item" style={{
      display: 'flex', gap: '1rem', alignItems: 'flex-start', marginBottom: '2rem',
      opacity: visible ? 1 : 0, transform: visible ? 'translateX(0)' : 'translateX(-30px)',
      transition: `all 0.7s cubic-bezier(0.23,1,0.32,1) ${index * 0.15}s`,
    }}>
      <div className="step-number" style={{ width: 52, height: 52, minWidth: 52, borderRadius: '50%', background: 'linear-gradient(135deg, #2E7D32, #43A047)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', fontFamily: "'Space Grotesk', system-ui, sans-serif", fontWeight: 700, boxShadow: '0 4px 20px rgba(46,125,50,0.3)', position: 'relative', zIndex: 1 }}>{n}</div>
      <div style={{ paddingTop: '0.2rem' }}>
        <h3 style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontSize: 'clamp(0.95rem, 2.5vw, 1.15rem)', fontWeight: 700, marginBottom: '0.3rem', letterSpacing: '-0.01em', color: dark ? '#e8f5e9' : '#1a2a1a' }}>{title}</h3>
        <p style={{ color: dark ? 'rgba(200,230,201,0.4)' : '#4a6a4a', lineHeight: 1.6, fontSize: 'clamp(0.82rem, 2vw, 0.95rem)' }}>{desc}</p>
      </div>
    </div>
  );
}

const inputStyle = {
  padding: '0.85rem 1.2rem', borderRadius: 12, border: '2px solid rgba(46,125,50,0.12)',
  background: '#fff', fontSize: '0.9rem', outline: 'none', fontFamily: 'inherit',
  transition: 'border-color 0.3s',
};

function TrackedSection({ name, children, ...props }) {
  const ref = useRef(null);
  const tracked = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !tracked.current) {
          tracked.current = true;
          trackSection(name, 'view');
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [name]);
  return <div ref={ref} {...props}>{children}</div>;
}

function ContactForm() {
  const [expanded, setExpanded] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [escola, setEscola] = useState('');
  const [assunto, setAssunto] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentPhase, setSentPhase] = useState(0);
  const [focusedField, setFocusedField] = useState(null);

  const handleSend = (e) => {
    e.preventDefault();
    setSending(true);
    trackForm('submit', { assunto, nome });
    setTimeout(() => {
      setSending(false);
      setSent(true);
      setSentPhase(1);
      setTimeout(() => setSentPhase(2), 600);
      setTimeout(() => setSentPhase(3), 1400);
      setTimeout(() => setSentPhase(4), 2200);
      const body = encodeURIComponent(
        `Nome: ${nome}\nE-mail: ${email}\nEscola: ${escola}\nAssunto: ${assunto}\n\nMensagem:\n${mensagem}`
      );
      setTimeout(() => {
        window.open(
          `mailto:contato@bibliotecai.com.br?subject=${encodeURIComponent('Contato - ' + assunto)}&body=${body}`,
          '_blank'
        );
      }, 2800);
    }, 800);
  };

  const paperBg = {
    background: 'linear-gradient(175deg, #f5f0e1 0%, #ede6d3 30%, #e8dfc8 60%, #f0e8d5 100%)',
    position: 'relative',
  };

  const fieldStyle = (name) => ({
    width: '100%', padding: '0.85rem 1rem',
    border: 'none', borderBottom: `1.5px solid ${focusedField === name ? '#5a3e1b' : 'rgba(90,62,27,0.25)'}`,
    background: 'transparent',
    fontSize: '1.1rem', outline: 'none', fontFamily: "'Kalam', cursive",
    color: '#3a2a15', transition: 'all 0.25s ease',
    letterSpacing: '0.01em', fontWeight: 400,
  });

  const labelStyle = {
    display: 'block', fontSize: '1.05rem', fontWeight: 700, color: '#5a3e1b',
    marginBottom: '0.35rem', fontFamily: "'Kalam', cursive",
    letterSpacing: '0.02em',
  };

  if (sent) {
    return (
      <section id="contato" style={{ padding: '5rem 1.5rem', background: '#0d1a10', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.02, backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 520, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ ...paperBg, borderRadius: 8, padding: '3rem 2rem', boxShadow: '0 8px 40px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.5)', transform: sentPhase >= 1 ? 'scale(1)' : 'scale(0.8)', opacity: sentPhase >= 1 ? 1 : 0, transition: 'all 0.6s cubic-bezier(0.34,1.56,0.64,1)' }}>
            {/* Paper texture lines */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 31px, rgba(90,62,27,0.06) 31px, rgba(90,62,27,0.06) 32px)', pointerEvents: 'none', borderRadius: 8 }} />
            {/* Red margin line */}
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: 60, width: 1.5, background: 'rgba(200,60,60,0.15)', pointerEvents: 'none' }} />

            {/* Seal stamp */}
            <div style={{
              width: 100, height: 100, margin: '0 auto 1.5rem', position: 'relative',
              opacity: sentPhase >= 2 ? 1 : 0, transform: sentPhase >= 2 ? 'scale(1) rotate(-8deg)' : 'scale(3) rotate(-15deg)',
              transition: 'all 0.5s cubic-bezier(0.34,1.56,0.64,1)',
            }}>
              <svg viewBox="0 0 100 100" width="100" height="100" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))' }}>
                <circle cx="50" cy="50" r="46" fill="none" stroke="#2E7D32" strokeWidth="3" strokeDasharray="4 2" />
                <circle cx="50" cy="50" r="38" fill="none" stroke="#2E7D32" strokeWidth="1.5" />
                <text x="50" y="38" textAnchor="middle" fill="#2E7D32" fontSize="10" fontFamily="'Space Grotesk', sans-serif" fontWeight="700" letterSpacing="0.1em">ENVIADO</text>
                <text x="50" y="55" textAnchor="middle" fill="#2E7D32" fontSize="7" fontFamily="'Kalam', cursive">com carinho</text>
                <polyline points="30,65 42,65 46,60 54,70 58,65 70,65" fill="none" stroke="#2E7D32" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            <h2 style={{ fontFamily: "'Kalam', cursive", fontSize: 'clamp(2rem, 5vw, 2.8rem)', fontWeight: 700, color: '#3a2a15', marginBottom: '0.5rem', opacity: sentPhase >= 3 ? 1 : 0, transform: sentPhase >= 3 ? 'translateY(0)' : 'translateY(15px)', transition: 'all 0.5s ease 0.1s' }}>
              Mensagem enviada!
            </h2>
            <p style={{ fontSize: '1.15rem', color: '#7a5a30', lineHeight: 1.7, marginBottom: '2rem', fontFamily: "'Kalam', cursive", opacity: sentPhase >= 3 ? 1 : 0, transition: 'opacity 0.5s ease 0.3s' }}>
              Seu cliente de e-mail foi aberto.<br/>Envie o e-mail para concluir.
            </p>
            <button onClick={() => { setSent(false); setSentPhase(0); setExpanded(false); setNome(''); setEmail(''); setEscola(''); setAssunto(''); setMensagem(''); }} style={{
              padding: '0.85rem 1.8rem', background: 'transparent', border: '1.5px solid rgba(90,62,27,0.25)',
              borderRadius: 4, fontWeight: 700, fontSize: '1.05rem', cursor: 'pointer',
              fontFamily: "'Kalam', cursive", color: '#5a3e1b', transition: 'all 0.2s',
              opacity: sentPhase >= 4 ? 1 : 0, transform: sentPhase >= 4 ? 'translateY(0)' : 'translateY(10px)',
            }} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(90,62,27,0.06)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
              Escrever outra mensagem
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="contato" style={{ padding: '5rem 1.5rem', background: '#0d1a10', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, opacity: 0.02, backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)', backgroundSize: '40px 40px' }} />
      <div style={{ position: 'absolute', bottom: '-30%', left: '-10%', width: '50vw', height: '60vh', background: 'radial-gradient(ellipse, rgba(67,160,71,0.08) 0%, transparent 60%)', filter: 'blur(60px)' }} />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 640, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.9rem', background: 'rgba(67,160,71,0.1)', border: '1px solid rgba(67,160,71,0.15)', borderRadius: 50, fontSize: '0.72rem', fontWeight: 700, color: '#43A047', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '1.2rem' }}>
            <Send size={14} /> Fale Conosco
          </div>
          <h2 style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 700, lineHeight: 1.2, marginBottom: '0.6rem', letterSpacing: '-0.02em', color: '#e8f5e9' }}>
            Vamos conversar?
          </h2>
          <p style={{ fontSize: '1rem', color: 'rgba(200,230,201,0.45)', lineHeight: 1.7 }}>
            Clique no botao e escreva sua mensagem. A gente responde rapido.
          </p>
        </div>

        {!expanded ? (
          <div style={{ textAlign: 'center' }}>
              <button onClick={() => { setExpanded(true); trackForm('expand'); }} style={{
              padding: '1rem 2.5rem', background: 'transparent',
              color: '#e8d9b8', border: '1.5px solid rgba(232,217,184,0.25)',
              borderRadius: 4, fontWeight: 700, fontSize: '1.15rem',
              cursor: 'pointer', fontFamily: "'Kalam', cursive",
              display: 'inline-flex', alignItems: 'center', gap: '0.6rem',
              transition: 'all 0.3s', position: 'relative',
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
              letterSpacing: '0.02em',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.3)'; e.currentTarget.style.borderColor = 'rgba(232,217,184,0.4)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.2)'; e.currentTarget.style.borderColor = 'rgba(232,217,184,0.25)'; }}>
              <Mail size={18} /> Escrever na folha <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <div style={{
            ...paperBg,
            borderRadius: 8, padding: '2rem 2rem 1.5rem',
            boxShadow: '0 12px 50px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.5)',
            position: 'relative', overflow: 'hidden',
            animation: 'paperOpen 0.5s cubic-bezier(0.34,1.56,0.64,1)',
          }}>
            {/* Ruled lines */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 31px, rgba(90,62,27,0.06) 31px, rgba(90,62,27,0.06) 32px)', pointerEvents: 'none' }} />
            {/* Red margin line */}
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: 56, width: 1.5, background: 'rgba(200,60,60,0.15)', pointerEvents: 'none' }} />
            {/* Coffee stain */}
            <div style={{ position: 'absolute', top: 20, right: 30, width: 60, height: 60, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(139,90,43,0.06) 30%, rgba(139,90,43,0.03) 50%, transparent 70%)', pointerEvents: 'none' }} />
            {/* Paper fold crease */}
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: 'rgba(0,0,0,0.03)', pointerEvents: 'none' }} />

            <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem', position: 'relative', zIndex: 1 }}>
              <div className="contact-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Seu nome</label>
                  <input name="nome" type="text" placeholder="como se chama?" required value={nome} onChange={(e) => setNome(e.target.value)} maxLength={100} style={fieldStyle('nome')}
                    onFocus={() => setFocusedField('nome')} onBlur={() => setFocusedField(null)} />
                </div>
                <div>
                  <label style={labelStyle}>Seu e-mail</label>
                  <input name="email" type="email" placeholder="para onde responder?" required value={email} onChange={(e) => setEmail(e.target.value)} style={fieldStyle('email')}
                    onFocus={() => setFocusedField('email')} onBlur={() => setFocusedField(null)} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Escola</label>
                <input name="escola" type="text" placeholder="qual escola? (opcional)" value={escola} onChange={(e) => setEscola(e.target.value)} maxLength={200} style={fieldStyle('escola')}
                  onFocus={() => setFocusedField('escola')} onBlur={() => setFocusedField(null)} />
              </div>
              <div>
                <label style={labelStyle}>Assunto</label>
                <select name="assunto" required value={assunto} onChange={(e) => setAssunto(e.target.value)} style={{ ...fieldStyle('assunto'), color: assunto ? '#3a2a15' : '#a09080', appearance: 'none', cursor: 'pointer', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%237a5a30' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem center', paddingRight: '2rem' }}
                  onFocus={() => setFocusedField('assunto')} onBlur={() => setFocusedField(null)}>
                  <option value="" disabled>escolha o motivo...</option>
                  <option value="Demonstracao">Quero ver funcionando</option>
                  <option value="Duvidas">Tenho duvidas</option>
                  <option value="Parceria">Quero fazer parceria</option>
                  <option value="Suporte">Preciso de ajuda</option>
                  <option value="Outro">Outra coisa</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Mensagem</label>
                <textarea name="mensagem" placeholder="escreva aqui..." rows={4} required value={mensagem} onChange={(e) => setMensagem(e.target.value)} maxLength={2000} autoFocus style={{ ...fieldStyle('mensagem'), resize: 'vertical', minHeight: 100, borderBottom: 'none', border: '1px solid rgba(90,62,27,0.12)', borderRadius: 4, padding: '0.8rem 1rem', fontSize: '1rem' }}
                  onFocus={() => setFocusedField('mensagem')} onBlur={() => setFocusedField(null)} />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.3rem', alignItems: 'stretch' }}>
                <button type="button" onClick={() => setExpanded(false)} style={{
                  padding: '0.7rem 1.2rem', background: 'transparent', border: '1px solid rgba(90,62,27,0.18)',
                  borderRadius: 4, fontWeight: 600, fontSize: '1rem', cursor: 'pointer',
                  fontFamily: "'Kalam', cursive", color: '#8a7050', flexShrink: 0, transition: 'all 0.2s',
                }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(90,62,27,0.35)'; e.currentTarget.style.color = '#5a3e1b'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(90,62,27,0.18)'; e.currentTarget.style.color = '#8a7050'; }}>
                  Guardar
                </button>
                <button type="submit" disabled={sending} style={{
                  padding: '0.7rem 1.5rem', background: sending ? 'rgba(46,125,50,0.08)' : 'transparent',
                  color: '#2E7D32', border: '2px solid #2E7D32', borderRadius: 4, fontWeight: 700, fontSize: '1.1rem',
                  cursor: sending ? 'wait' : 'pointer', fontFamily: "'Kalam', cursive",
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                  flex: 1, transition: 'all 0.3s', position: 'relative', overflow: 'hidden',
                  letterSpacing: '0.03em',
                }}
                onMouseEnter={(e) => { if (!sending) { e.currentTarget.style.background = 'rgba(46,125,50,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
                onMouseLeave={(e) => { if (!sending) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'translateY(0)'; } }}>
                  {sending ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" style={{ animation: 'spin 0.8s linear infinite' }}>
                        <circle cx="12" cy="12" r="10" fill="none" stroke="#2E7D32" strokeWidth="2.5" strokeDasharray="30 70" strokeLinecap="round" />
                      </svg>
                      Enviando...
                    </span>
                  ) : (
                    <><Send size={16} /> Pregar no mural</>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <a href="mailto:contato@bibliotecai.com.br" style={{ fontSize: '0.85rem', color: 'rgba(200,230,201,0.35)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', transition: 'color 0.2s' }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#43A047'} onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(200,230,201,0.35)'}>
            <Mail size={14} /> contato@bibliotecai.com.br
          </a>
        </div>
      </div>
    </section>
  );
}
