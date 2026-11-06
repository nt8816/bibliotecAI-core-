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
