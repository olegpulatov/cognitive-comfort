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
});
