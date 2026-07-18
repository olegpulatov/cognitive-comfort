// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleWhenBodyReady } from '../src/entrypoints/comfort.content/dom-ready';

describe('scheduleWhenBodyReady', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body></body>';
  });

  afterEach(() => {
    document.documentElement.innerHTML = '<head></head><body></body>';
  });

  it('runs a pending start exactly once at DOMContentLoaded', () => {
    document.body.remove();
    const start = vi.fn();

    const cancel = scheduleWhenBodyReady(start);
    expect(cancel).toBeTypeOf('function');
    expect(start).not.toHaveBeenCalled();

    document.dispatchEvent(new Event('DOMContentLoaded'));
    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending start', () => {
    document.body.remove();
    const start = vi.fn();

    const cancel = scheduleWhenBodyReady(start);
    cancel?.();
    document.dispatchEvent(new Event('DOMContentLoaded'));

    expect(start).not.toHaveBeenCalled();
  });

  it('starts immediately and returns no pending cancellation handle when body exists', () => {
    const start = vi.fn();

    expect(scheduleWhenBodyReady(start)).toBeNull();
    expect(start).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(start).toHaveBeenCalledTimes(1);
  });
});
