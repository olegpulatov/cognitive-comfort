// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BG_IMAGE_ATTR,
  setupBgImageDetector,
  teardownBgImageDetector,
} from '../src/entrypoints/comfort.content/bg-image-detector';

function rect(width = 200, height = 120): DOMRect {
  return new DOMRect(0, 0, width, height);
}

function installComputedBackgrounds(): void {
  vi.spyOn(globalThis, 'getComputedStyle').mockImplementation((element) => ({
    backgroundImage: element.hasAttribute('data-test-background') ? 'url("fixture.png")' : 'none',
  }) as CSSStyleDeclaration);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(rect());
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(performance.now());
    return 0;
  });
}

function deferAnimationFrames(): Array<FrameRequestCallback> {
  const frames: Array<FrameRequestCallback> = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  return frames;
}

function appendBackgrounds(count: number): HTMLDivElement[] {
  const elements = Array.from({ length: count }, () => {
    const element = document.createElement('div');
    element.setAttribute('data-test-background', '');
    return element;
  });
  document.body.append(...elements);
  return elements;
}

function captureMutationObservers(): MutationCallback[] {
  const callbacks: MutationCallback[] = [];
  class TestMutationObserver {
    constructor(callback: MutationCallback) {
      callbacks.push(callback);
    }
    observe(): void {}
    disconnect(): void {}
    takeRecords(): MutationRecord[] {
      return [];
    }
  }
  vi.stubGlobal('MutationObserver', TestMutationObserver);
  return callbacks;
}

function notifyAdded(callback: MutationCallback, elements: Element[]): void {
  callback([
    {
      type: 'childList',
      target: document.body,
      addedNodes: elements,
      removedNodes: [],
    } as unknown as MutationRecord,
  ], {} as MutationObserver);
}

describe('background image detector', () => {
  beforeEach(() => {
    teardownBgImageDetector();
    document.body.innerHTML = '';
    installComputedBackgrounds();
  });

  afterEach(() => {
    teardownBgImageDetector();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('marks eligible computed background URLs', () => {
    const media = document.createElement('div');
    media.setAttribute('data-test-background', '');
    document.body.append(media);

    setupBgImageDetector();

    expect(media.getAttribute(BG_IMAGE_ATTR)).toBe('true');
  });

  it('skips interactive, crowded, full-viewport, and media elements', () => {
    const interactive = document.createElement('div');
    interactive.setAttribute('data-test-background', '');
    interactive.append(document.createElement('button'));

    const crowded = document.createElement('div');
    crowded.setAttribute('data-test-background', '');
    crowded.append(...Array.from({ length: 4 }, () => document.createElement('span')));

    const fullViewport = document.createElement('div');
    fullViewport.setAttribute('data-test-background', '');
    vi.spyOn(fullViewport, 'getBoundingClientRect').mockReturnValue(rect(900, 700));
    vi.stubGlobal('innerWidth', 1000);
    vi.stubGlobal('innerHeight', 800);

    const image = document.createElement('img');
    image.setAttribute('data-test-background', '');
    document.body.append(interactive, crowded, fullViewport, image);

    setupBgImageDetector();

    expect(interactive.hasAttribute(BG_IMAGE_ATTR)).toBe(false);
    expect(crowded.hasAttribute(BG_IMAGE_ATTR)).toBe(false);
    expect(fullViewport.hasAttribute(BG_IMAGE_ATTR)).toBe(false);
    expect(image.hasAttribute(BG_IMAGE_ATTR)).toBe(false);
  });

  it('reacts to dynamic nodes and style or class changes', () => {
    let observerCallback: MutationCallback | undefined;
    class TestMutationObserver {
      constructor(callback: MutationCallback) {
        observerCallback = callback;
      }
      observe(): void {}
      disconnect(): void {}
      takeRecords(): MutationRecord[] {
        return [];
      }
    }
    vi.stubGlobal('MutationObserver', TestMutationObserver);

    setupBgImageDetector();
    const media = document.createElement('div');
    media.setAttribute('data-test-background', '');
    document.body.append(media);
    observerCallback?.([
      { type: 'childList', target: media, addedNodes: [media], removedNodes: [] } as unknown as MutationRecord,
    ], {} as MutationObserver);
    expect(media.getAttribute(BG_IMAGE_ATTR)).toBe('true');

    media.removeAttribute('data-test-background');
    media.classList.add('changed');
    observerCallback?.([
      { type: 'attributes', target: media, addedNodes: [], removedNodes: [] } as unknown as MutationRecord,
    ], {} as MutationObserver);
    expect(media.hasAttribute(BG_IMAGE_ATTR)).toBe(false);
  });

  it('keeps one observer and teardown disconnects it and removes marks', () => {
    teardownBgImageDetector();
    const instances: Array<{ disconnected: boolean }> = [];
    class TrackingMutationObserver {
      disconnected = false;
      constructor(_callback: MutationCallback) {
        instances.push(this);
      }
      observe(): void {}
      disconnect(): void {
        this.disconnected = true;
      }
      takeRecords(): MutationRecord[] {
        return [];
      }
    }
    vi.stubGlobal('MutationObserver', TrackingMutationObserver);

    const media = document.createElement('div');
    media.setAttribute('data-test-background', '');
    document.body.append(media);

    setupBgImageDetector();
    setupBgImageDetector();
    expect(instances).toHaveLength(1);

    teardownBgImageDetector();
    expect(instances.every((instance) => instance.disconnected)).toBe(true);
    expect(media.hasAttribute(BG_IMAGE_ATTR)).toBe(false);

    const later = document.createElement('div');
    later.setAttribute('data-test-background', '');
    document.body.append(later);
    expect(later.hasAttribute(BG_IMAGE_ATTR)).toBe(false);
  });

  it('re-evaluates container when childList mutations occur (children added or removed)', () => {
    let observerCallback: MutationCallback | undefined;
    class TestMutationObserver {
      constructor(callback: MutationCallback) {
        observerCallback = callback;
      }
      observe(): void {}
      disconnect(): void {}
      takeRecords(): MutationRecord[] {
        return [];
      }
    }
    vi.stubGlobal('MutationObserver', TestMutationObserver);

    const container = document.createElement('div');
    container.setAttribute('data-test-background', '');
    document.body.append(container);

    setupBgImageDetector();
    expect(container.getAttribute(BG_IMAGE_ATTR)).toBe('true');

    // Add a button inside container -> becomes interactive -> mark should be removed
    const btn = document.createElement('button');
    container.append(btn);
    observerCallback?.([
      { type: 'childList', target: container, addedNodes: [btn], removedNodes: [] } as unknown as MutationRecord,
    ], {} as MutationObserver);
    expect(container.hasAttribute(BG_IMAGE_ATTR)).toBe(false);

    // Remove button -> becomes eligible again -> mark should be restored
    container.removeChild(btn);
    observerCallback?.([
      { type: 'childList', target: container, addedNodes: [], removedNodes: [btn] } as unknown as MutationRecord,
    ], {} as MutationObserver);
    expect(container.getAttribute(BG_IMAGE_ATTR)).toBe('true');
  });

  it('does not restore marks after teardown during an initial multi-frame scan', () => {
    const frames = deferAnimationFrames();
    const elements = appendBackgrounds(201);
    setupBgImageDetector();
    expect(elements[0].hasAttribute(BG_IMAGE_ATTR)).toBe(true);
    expect(elements[100].hasAttribute(BG_IMAGE_ATTR)).toBe(false);

    teardownBgImageDetector();
    while (frames.length) frames.shift()!(0);

    expect(elements.every((element) => !element.hasAttribute(BG_IMAGE_ATTR))).toBe(true);
  });

  it('does not let an old initial frame advance a restarted scan', () => {
    const frames = deferAnimationFrames();
    const elements = appendBackgrounds(201);
    setupBgImageDetector();
    teardownBgImageDetector();
    setupBgImageDetector();

    frames.shift()!(0);
    expect(elements[100].hasAttribute(BG_IMAGE_ATTR)).toBe(false);
    expect(elements[200].hasAttribute(BG_IMAGE_ATTR)).toBe(false);

    while (frames.length) frames.shift()!(0);
    expect(elements.every((element) => element.hasAttribute(BG_IMAGE_ATTR))).toBe(true);
  });

  it.each([false, true])(
    'does not let stale mutation work consume a restarted queue (continuation: %s)',
    (continuation) => {
      const frames = deferAnimationFrames();
      const callbacks = captureMutationObservers();
      setupBgImageDetector();
      const oldElements = appendBackgrounds(201);
      notifyAdded(callbacks[0], oldElements);
      if (continuation) frames.shift()!(0);

      teardownBgImageDetector();
      oldElements.forEach((element) => element.remove());
      setupBgImageDetector();
      const [current] = appendBackgrounds(1);
      notifyAdded(callbacks[1], [current]);

      // Deliver the old frame even though its observer has been disconnected.
      frames.shift()!(0);
      expect(current.hasAttribute(BG_IMAGE_ATTR)).toBe(false);
      expect(oldElements.every((element) => !element.hasAttribute(BG_IMAGE_ATTR))).toBe(true);

      while (frames.length) frames.shift()!(0);
      expect(current.hasAttribute(BG_IMAGE_ATTR)).toBe(true);

      const [later] = appendBackgrounds(1);
      notifyAdded(callbacks[0], [later]);
      while (frames.length) frames.shift()!(0);
      expect(later.hasAttribute(BG_IMAGE_ATTR)).toBe(false);
      notifyAdded(callbacks[1], [later]);
      while (frames.length) frames.shift()!(0);
      expect(later.hasAttribute(BG_IMAGE_ATTR)).toBe(true);
    }
  );

  it('skips elements detached before their initial or mutation frame runs', () => {
    const frames = deferAnimationFrames();
    const callbacks = captureMutationObservers();
    const elements = appendBackgrounds(101);
    setupBgImageDetector();
    const detached = elements[100];
    detached.remove();
    while (frames.length) frames.shift()!(0);
    expect(detached.hasAttribute(BG_IMAGE_ATTR)).toBe(false);

    const [added] = appendBackgrounds(1);
    notifyAdded(callbacks[0], [added]);
    added.remove();
    while (frames.length) frames.shift()!(0);
    expect(added.hasAttribute(BG_IMAGE_ATTR)).toBe(false);
  });
});
