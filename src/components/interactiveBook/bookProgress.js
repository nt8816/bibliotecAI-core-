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
