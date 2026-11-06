import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installZoomRestrictions } from '@/lib/zoomRestrictions';

describe('platform zoom restrictions', () => {
  let target;
  let cleanup;

  beforeEach(() => {
    target = new EventTarget();
    cleanup = installZoomRestrictions(target);
  });

  afterEach(() => cleanup());

  it('blocks Safari pinch gestures', () => {
    for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
      const event = new Event(name, { cancelable: true });
      target.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
  });

  it('blocks modified wheel gestures but preserves ordinary scrolling', () => {
    for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, {}]) {
      const event = new WheelEvent('wheel', { ...modifiers, deltaY: 100, cancelable: true });
      target.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(Boolean(modifiers.ctrlKey || modifiers.metaKey));
    }
  });

  it('blocks zoom shortcuts while preserving typing and other shortcuts', () => {
    for (const modifier of ['ctrlKey', 'metaKey']) {
      for (const key of ['+', '=', '-', '0']) {
        const event = new KeyboardEvent('keydown', { key, [modifier]: true, cancelable: true });
        target.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
      }
    }
    for (const options of [{ key: '+' }, { key: '-' }, { key: '0' }, { key: 'c', ctrlKey: true }, { key: 'v', metaKey: true }]) {
      const event = new KeyboardEvent('keydown', { ...options, cancelable: true });
      target.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
  });

  it('removes all listeners when disposed', () => {
    cleanup();
    const events = [
      ...['gesturestart', 'gesturechange', 'gestureend'].map((name) => new Event(name, { cancelable: true })),
      new WheelEvent('wheel', { ctrlKey: true, cancelable: true }),
      new KeyboardEvent('keydown', { key: '+', ctrlKey: true, cancelable: true }),
    ];
    for (const event of events) {
      target.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
  });
});
