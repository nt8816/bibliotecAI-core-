import { useEffect, useState } from 'react';
import { BookOpen, Bookmark, GraduationCap, Leaf, Sparkles } from 'lucide-react';

export function useSystemColorScheme() {
  const [theme, setTheme] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  ));

  useEffect(() => {
    const preference = window.matchMedia('(prefers-color-scheme: dark)');
    const updateTheme = () => setTheme(preference.matches ? 'dark' : 'light');
    updateTheme();
    preference.addEventListener('change', updateTheme);
    return () => preference.removeEventListener('change', updateTheme);
  }, []);

  return theme;
}

const floatingElements = [
  { Icon: BookOpen, x: '3%', y: '20%', size: 55, turn: '-18deg', duration: '19s' },
  { Icon: Sparkles, x: '41%', y: '8%', size: 28, turn: '12deg', duration: '14s' },
  { Icon: Bookmark, x: '91%', y: '15%', size: 42, turn: '20deg', duration: '22s' },
  { Icon: Leaf, x: '95%', y: '61%', size: 52, turn: '-24deg', duration: '18s' },
  { Icon: GraduationCap, x: '6%', y: '79%', size: 47, turn: '14deg', duration: '24s' },
  { Icon: BookOpen, x: '68%', y: '88%', size: 37, turn: '-12deg', duration: '21s' },
  { Icon: Sparkles, x: '33%', y: '62%', size: 21, turn: '8deg', duration: '17s' },
];

export default function LandingAtmosphere({ variant = 'page' }) {
  return <div className={`lp-ambient lp-ambient--${variant}`} aria-hidden="true">
    <div className="lp-ambient-glow lp-ambient-glow--one" />
    <div className="lp-ambient-glow lp-ambient-glow--two" />
    <div className="lp-ambient-glow lp-ambient-glow--three" />
    <div className="lp-ambient-orbit lp-ambient-orbit--one"><span /></div>
    <div className="lp-ambient-orbit lp-ambient-orbit--two"><span /></div>
    {floatingElements.map(({ Icon, x, y, size, turn, duration }, index) => <span key={index} className="lp-ambient-symbol" style={{ left: x, top: y, '--symbol-size': `${size}px`, '--symbol-turn': turn, '--motion-duration': duration, '--motion-delay': `${-index * 3}s` }}><Icon size={size} strokeWidth={0.8} /></span>)}
    {Array.from({ length: 16 }, (_, index) => <span key={index} className="lp-ambient-particle" style={{ left: `${(index * 37 + 11) % 100}%`, top: `${(index * 23 + 7) % 100}%`, '--particle-size': `${index % 3 + 2}px`, '--motion-duration': `${12 + index % 7 * 2}s`, '--motion-delay': `${-index * 1.8}s` }} />)}
  </div>;
}
