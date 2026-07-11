import { useState, useEffect } from 'react';

export const MOBILE_BREAKPOINT = 768;
export const TABLET_BREAKPOINT = 1024;

export function useResponsive() {
  const [r, setR] = useState(() => getR());

  useEffect(() => {
    const onResize = () => setR(getR());
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return r;
}

function getR() {
  if (typeof window === 'undefined') return { w: 1024, isMobile: false, isTablet: false, s: 1 };
  const w = window.innerWidth;
  const isMobile = w < MOBILE_BREAKPOINT;
  const isTablet = w >= MOBILE_BREAKPOINT && w < TABLET_BREAKPOINT;
  let s = 1;
  if (w < 480) s = 0.65;
  else if (w < 640) s = 0.75;
  else if (w < 1024) s = 0.88;
  else if (w < 1280) s = 1;
  else s = 1.1;
  return { w, isMobile, isTablet, s };
}
