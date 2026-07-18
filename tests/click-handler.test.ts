// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  setupRevealHandlers,
  teardownRevealHandlers,
  updateRevealMode,
} from '../src/entrypoints/comfort.content/click-handler';
import { REVEALED_ATTR } from '../src/entrypoints/comfort.content/styles';


describe('reveal handlers', () => {
  beforeEach(() => {
    teardownRevealHandlers();
    document.body.innerHTML = '';
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 240, 160));
    vi.spyOn(globalThis, 'getComputedStyle').mockImplementation((element) => ({
      filter: element.matches('img, [data-comfort-bg-image]') ? 'blur(40px)' : 'none',
    }) as CSSStyleDeclaration);
  });

  afterEach(() => {
    teardownRevealHandlers();
    vi.restoreAllMocks();
  });

  it('reveals a linked media cluster, swallows the first click, and allows the second activation', () => {
    document.body.innerHTML = `
      <a id="link" href="#destination">
        <img id="primary" src="one.png">
        <img id="sibling" src="two.png">
      </a>
    `;
    const primary = document.querySelector('#primary') as HTMLImageElement;
    const sibling = document.querySelector('#sibling') as HTMLImageElement;
    setupRevealHandlers('click');

    const firstPointerDown = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    const firstClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    expect(primary.dispatchEvent(firstPointerDown)).toBe(false);
    expect(primary.hasAttribute(REVEALED_ATTR)).toBe(true);
    expect(sibling.hasAttribute(REVEALED_ATTR)).toBe(true);
    expect(primary.dispatchEvent(firstClick)).toBe(false);

    const secondPointerDown = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    const secondClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    expect(primary.dispatchEvent(secondPointerDown)).toBe(true);
    expect(primary.dispatchEvent(secondClick)).toBe(true);
  });

  it('transitions between hover and click modes without stale reveal state', () => {
    document.body.innerHTML = '<img id="media" src="media.png">';
    const media = document.querySelector('#media') as HTMLImageElement;
    setupRevealHandlers('hover');

    media.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    expect(media.hasAttribute(REVEALED_ATTR)).toBe(true);

    updateRevealMode('click');
    expect(media.hasAttribute(REVEALED_ATTR)).toBe(false);
    media.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    expect(media.hasAttribute(REVEALED_ATTR)).toBe(false);
    media.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    expect(media.hasAttribute(REVEALED_ATTR)).toBe(true);

    updateRevealMode('hover');
    expect(media.hasAttribute(REVEALED_ATTR)).toBe(false);
  });

  it('clears reveal attributes on teardown, page hiding, and hidden visibility', () => {
    document.body.innerHTML = '<img id="media" src="media.png">';
    const media = document.querySelector('#media') as HTMLImageElement;
    setupRevealHandlers('click');

    media.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    expect(media.hasAttribute(REVEALED_ATTR)).toBe(true);
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    expect(media.hasAttribute(REVEALED_ATTR)).toBe(false);

    media.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(media.hasAttribute(REVEALED_ATTR)).toBe(false);

    media.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    teardownRevealHandlers();
    expect(media.hasAttribute(REVEALED_ATTR)).toBe(false);
  });
});
