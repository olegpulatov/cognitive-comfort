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
    document.body.innerHTML = '';
    delete (document as unknown as { elementsFromPoint?: unknown }).elementsFromPoint;
    delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;

    // Provide non-zero dimensions so bounding-box containment helpers treat elements as valid.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 240,
      height: 160,
      top: 0,
      left: 0,
      right: 240,
      bottom: 160,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
  });

  afterEach(() => {
    teardownRevealHandlers();
    delete (document as unknown as { elementsFromPoint?: unknown }).elementsFromPoint;
    delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
    vi.restoreAllMocks();
  });

  it('reveals a linked media cluster, swallows the first click, and allows the second activation', () => {
    document.body.innerHTML = `
      <a id="link" href="#dest">
        <img id="thumb" src="thumb.png">
        <img id="overlay" src="overlay.png">
      </a>
    `;

    const thumb = document.querySelector('#thumb') as HTMLImageElement;
    const overlay = document.querySelector('#overlay') as HTMLImageElement;

    setupRevealHandlers('click');

    let defaultPrevented = false;
    const firstPointerDown = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    defaultPrevented = !thumb.dispatchEvent(firstPointerDown);

    expect(defaultPrevented).toBe(true);
    expect(thumb.hasAttribute(REVEALED_ATTR)).toBe(true);
    expect(overlay.hasAttribute(REVEALED_ATTR)).toBe(true);

    const secondPointerDown = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    defaultPrevented = !thumb.dispatchEvent(secondPointerDown);
    expect(defaultPrevented).toBe(false);
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

  it('keeps hover reveal after a media node is replaced under the cursor', async () => {
    vi.useFakeTimers();
    try {
      document.body.innerHTML = '<div id="slot"><img id="old" src="old.png"></div>';
      setupRevealHandlers('hover');

      const old = document.querySelector('#old') as HTMLImageElement;
      // The follow-up reveals the replacement that now sits under the cursor.
      const replacement = document.createElement('img');
      replacement.setAttribute('id', 'replacement');
      replacement.setAttribute('src', 'new.png');
      const elementFromPoint = vi
        .spyOn(document, 'elementFromPoint')
        .mockImplementation(() => old);

      // Hover the media with explicit coordinates so reconcile can relocate it.
      old.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        clientX: 130,
        clientY: 100,
      }));
      expect(old.hasAttribute(REVEALED_ATTR)).toBe(true);

      // YouTube-style replacement: swap the media node with the cursor stationary.
      document.querySelector('#slot')!.replaceChildren(replacement);
      elementFromPoint.mockImplementation(() => replacement);

      // Observation fire + the scheduleReconcile(0) debounce both settle here.
      await vi.advanceTimersByTimeAsync(0);
      expect(replacement.hasAttribute(REVEALED_ATTR)).toBe(true);
      elementFromPoint.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not clear hover reveal on a descendant pointerleave', () => {
    // Structural tree: container > [overlay, thumb]
    document.body.innerHTML = `
      <div id="card">
        <img id="thumb" src="thumb.png">
        <div id="overlay"></div>
      </div>
    `;
    const thumb = document.querySelector('#thumb') as HTMLImageElement;

    setupRevealHandlers('hover');

    // Hover the thumb first -> revealed
    thumb.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    expect(thumb.hasAttribute(REVEALED_ATTR)).toBe(true);

    // Pointer passes into the overlay (descendant pointerleave from thumb, but still inside card)
    thumb.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false }));
    // Hover reveal must remain active because the cursor is still in the card
    expect(thumb.hasAttribute(REVEALED_ATTR)).toBe(true);
  });

  it('does not clear hover reveal when a non-media overlay sits under the cursor during reconcile', async () => {
    vi.useFakeTimers();
    try {
      // Structure: card contains the media plus an overlay that sits on top
      document.body.innerHTML = `
        <div id="card">
          <img id="thumb" src="thumb.png">
          <div id="play-button-overlay"></div>
        </div>
      `;
      const thumb = document.querySelector('#thumb') as HTMLImageElement;
      const overlay = document.querySelector('#play-button-overlay') as HTMLDivElement;

      // Hover over the thumbnail first
      setupRevealHandlers('hover');
      thumb.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        clientX: 100,
        clientY: 80,
      }));
      expect(thumb.hasAttribute(REVEALED_ATTR)).toBe(true);

      // A mutation happens (e.g. YouTube mounts preview elements), and at that moment
      // document.elementFromPoint returns the overlay button, NOT the thumb directly.
      const elementFromPoint = vi
        .spyOn(document, 'elementFromPoint')
        .mockImplementation(() => overlay);

      // Trigger mutation observer reconcile
      const dummy = document.createElement('span');
      document.body.appendChild(dummy);

      await vi.advanceTimersByTimeAsync(0);

      // The thumb MUST still be revealed because findRevealTarget(overlay)
      // walks the card container to discover the media underneath.
      expect(thumb.hasAttribute(REVEALED_ATTR)).toBe(true);
      elementFromPoint.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not re-blur an existing hover layer when reconcile sees a partial cluster', async () => {
    vi.useFakeTimers();
    try {
      // Simulate multi-layer hover: initial thumb + newly mounted preview video
      document.body.innerHTML = `
        <div id="card">
          <img id="thumb" src="thumb.png">
          <video id="preview-video"></video>
        </div>
      `;
      const thumb = document.querySelector('#thumb') as HTMLImageElement;
      const video = document.querySelector('#preview-video') as HTMLVideoElement;

      setupRevealHandlers('hover');

      // Initial hover over thumb
      thumb.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        clientX: 100,
        clientY: 80,
      }));
      expect(thumb.hasAttribute(REVEALED_ATTR)).toBe(true);

      // Both thumb and video are now in the hover cluster
      const elementsFromPointSpy = vi.fn().mockReturnValue([video, thumb, document.body, document.documentElement]);
      Object.defineProperty(document, 'elementsFromPoint', {
        value: elementsFromPointSpy,
        configurable: true,
        writable: true,
      });

      // Pointer moves slightly over the video
      video.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        clientX: 105,
        clientY: 85,
      }));

      expect(video.hasAttribute(REVEALED_ATTR)).toBe(true);
      expect(thumb.hasAttribute(REVEALED_ATTR)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps reveal when a move resolves to no media while the cursor is inside, clears once it leaves', () => {
    document.body.innerHTML = `
      <div id="card">
        <img id="thumb" src="thumb.png">
      </div>
    `;
    const thumb = document.querySelector('#thumb') as HTMLImageElement;
    setupRevealHandlers('hover');

    // Hover over thumbnail at (100, 80)
    thumb.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 100, clientY: 80 }));
    expect(thumb.hasAttribute(REVEALED_ATTR)).toBe(true);

    // Pointermove fires over an unhandled coordinate inside the bounding box (150, 100)
    // where findRevealCluster returns [] (e.g. empty margin)
    document.body.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 150, clientY: 100 }));
    // Because (150, 100) is within the [0,0 -> 240,160] bounding box, hover remains active.
    expect(thumb.hasAttribute(REVEALED_ATTR)).toBe(true);

    // Cursor leaves the hovered rect entirely -> reveal clears.
    document.body.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 2000, clientY: 2000 }));
    expect(thumb.hasAttribute(REVEALED_ATTR)).toBe(false);
  });

  it('resolves stacked media via elementsFromPoint while keeping unrelated media blurred', () => {
    document.body.innerHTML = `
      <div id="video-card">
        <div id="scrim"></div>
        <video id="preview-video"></video>
        <img id="card-thumb" src="thumb.jpg">
      </div>
      <div id="unrelated-card">
        <img id="unrelated-thumb" src="other.jpg">
      </div>
    `;

    const scrim = document.querySelector('#scrim') as HTMLDivElement;
    const video = document.querySelector('#preview-video') as HTMLVideoElement;
    const thumb = document.querySelector('#card-thumb') as HTMLImageElement;
    const unrelated = document.querySelector('#unrelated-thumb') as HTMLImageElement;

    // Polyfill/mock elementsFromPoint on document for this test
    const elementsFromPointSpy = vi.fn().mockReturnValue([scrim, video, thumb, document.body, document.documentElement]);
    Object.defineProperty(document, 'elementsFromPoint', {
      value: elementsFromPointSpy,
      configurable: true,
      writable: true,
    });

    setupRevealHandlers('hover');

    // Move cursor over the scrim overlay
    scrim.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      clientX: 120,
      clientY: 80,
    }));

    expect(video.hasAttribute(REVEALED_ATTR)).toBe(true);
    expect(thumb.hasAttribute(REVEALED_ATTR)).toBe(true);
    expect(unrelated.hasAttribute(REVEALED_ATTR)).toBe(false);
  });

  it('reveals only hovered Short in a multi-item YouTube shelf carousel without unblurring sibling shorts', () => {
    document.body.innerHTML = `
      <ytd-reel-shelf-renderer>
        <div id="items">
          <ytd-reel-item-renderer id="short-1">
            <div id="thumbnail">
              <img id="thumb-1" src="short1.jpg">
            </div>
          </ytd-reel-item-renderer>
          <ytd-reel-item-renderer id="short-2">
            <div id="thumbnail">
              <img id="thumb-2" src="short2.jpg">
            </div>
          </ytd-reel-item-renderer>
        </div>
      </ytd-reel-shelf-renderer>
    `;

    const thumb1 = document.querySelector('#thumb-1') as HTMLImageElement;
    const thumb2 = document.querySelector('#thumb-2') as HTMLImageElement;
    const short1 = document.querySelector('#short-1') as HTMLElement;
    const items = document.querySelector('#items') as HTMLDivElement;
    const shelf = document.querySelector('ytd-reel-shelf-renderer') as HTMLElement;

    const elementsFromPointSpy = vi.fn().mockReturnValue([
      thumb1,
      short1,
      items,
      shelf,
      document.body,
      document.documentElement,
    ]);
    Object.defineProperty(document, 'elementsFromPoint', {
      value: elementsFromPointSpy,
      configurable: true,
      writable: true,
    });

    setupRevealHandlers('hover');

    thumb1.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      clientX: 50,
      clientY: 50,
    }));

    expect(thumb1.hasAttribute(REVEALED_ATTR)).toBe(true);
    expect(thumb2.hasAttribute(REVEALED_ATTR)).toBe(false);
  });

  it('reveals only hovered card inside an <article> grid without unblurring sibling articles', () => {
    document.body.innerHTML = `
      <main id="feed">
        <article id="art-1">
          <figure>
            <img id="art-img-1" src="art1.jpg">
          </figure>
        </article>
        <article id="art-2">
          <figure>
            <img id="art-img-2" src="art2.jpg">
          </figure>
        </article>
      </main>
    `;

    const img1 = document.querySelector('#art-img-1') as HTMLImageElement;
    const img2 = document.querySelector('#art-img-2') as HTMLImageElement;
    const art1 = document.querySelector('#art-1') as HTMLElement;
    const feed = document.querySelector('#feed') as HTMLElement;

    const elementsFromPointSpy = vi.fn().mockReturnValue([
      img1,
      art1,
      feed,
      document.body,
      document.documentElement,
    ]);
    Object.defineProperty(document, 'elementsFromPoint', {
      value: elementsFromPointSpy,
      configurable: true,
      writable: true,
    });

    setupRevealHandlers('hover');

    img1.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      clientX: 50,
      clientY: 50,
    }));

    expect(img1.hasAttribute(REVEALED_ATTR)).toBe(true);
    expect(img2.hasAttribute(REVEALED_ATTR)).toBe(false);
  });

  it('reveals only hovered item inside an <li> list without unblurring sibling list items', () => {
    document.body.innerHTML = `
      <ul id="gallery">
        <li id="item-1">
          <div class="wrap"><img id="li-img-1" src="li1.jpg"></div>
        </li>
        <li id="item-2">
          <div class="wrap"><img id="li-img-2" src="li2.jpg"></div>
        </li>
      </ul>
    `;

    const img1 = document.querySelector('#li-img-1') as HTMLImageElement;
    const img2 = document.querySelector('#li-img-2') as HTMLImageElement;
    const item1 = document.querySelector('#item-1') as HTMLElement;
    const gallery = document.querySelector('#gallery') as HTMLElement;

    const elementsFromPointSpy = vi.fn().mockReturnValue([
      img1,
      item1,
      gallery,
      document.body,
      document.documentElement,
    ]);
    Object.defineProperty(document, 'elementsFromPoint', {
      value: elementsFromPointSpy,
      configurable: true,
      writable: true,
    });

    setupRevealHandlers('hover');

    img1.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      clientX: 50,
      clientY: 50,
    }));

    expect(img1.hasAttribute(REVEALED_ATTR)).toBe(true);
    expect(img2.hasAttribute(REVEALED_ATTR)).toBe(false);
  });

  it('does not preventDefault or stopPropagation on pointermove over cards so YouTube listeners receive events', () => {
    document.body.innerHTML = `
      <ytd-rich-item-renderer id="video-1">
        <div id="thumbnail">
          <img id="thumb-1" src="v1.jpg">
        </div>
      </ytd-rich-item-renderer>
    `;

    const thumb1 = document.querySelector('#thumb-1') as HTMLImageElement;
    setupRevealHandlers('hover');

    let defaultPrevented = false;
    const moveEvent = new PointerEvent('pointermove', {
      bubbles: true,
      cancelable: true,
      clientX: 50,
      clientY: 50,
    });

    defaultPrevented = !thumb1.dispatchEvent(moveEvent);
    expect(defaultPrevented).toBe(false);
    expect(thumb1.hasAttribute(REVEALED_ATTR)).toBe(true);
  });

  it('does not treat plain colored divs without url() as media or swallow clicks on them', () => {
    document.body.innerHTML = `
      <div id="card" style="background: #ffffff; background-color: rgb(255, 255, 255);">
        <button id="action-btn">Click me</button>
      </div>
    `;

    const btn = document.querySelector('#action-btn') as HTMLButtonElement;
    setupRevealHandlers('click');

    const pointerDown = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 });
    const pointerDownSwallowed = !btn.dispatchEvent(pointerDown);
    expect(pointerDownSwallowed).toBe(false);

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    const clickSwallowed = !btn.dispatchEvent(clickEvent);
    expect(clickSwallowed).toBe(false);
  });

  it('does not swallow non-primary clicks (middle click) or modified clicks', () => {
    document.body.innerHTML = `
      <a id="link" href="https://example.com">
        <img id="media" src="test.jpg">
      </a>
    `;

    const media = document.querySelector('#media') as HTMLImageElement;
    setupRevealHandlers('click');

    // Middle click (button 1)
    const middlePointerDown = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 1 });
    expect(!media.dispatchEvent(middlePointerDown)).toBe(false);

    const middleClick = new MouseEvent('click', { bubbles: true, cancelable: true, button: 1 });
    expect(!media.dispatchEvent(middleClick)).toBe(false);

    // Meta+click (Cmd/Ctrl click)
    const metaPointerDown = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, metaKey: true });
    expect(!media.dispatchEvent(metaPointerDown)).toBe(false);

    const metaClick = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, metaKey: true });
    expect(!media.dispatchEvent(metaClick)).toBe(false);
  });

  it('click mode: swallows first click event and allows second click event to pass through', () => {
    document.body.innerHTML = `
      <a id="link" href="#destination">
        <img id="thumb" src="thumb.jpg">
      </a>
    `;

    const thumb = document.querySelector('#thumb') as HTMLImageElement;
    setupRevealHandlers('click');

    // 1st activation: pointerdown swallowed
    const pd1 = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 });
    expect(!thumb.dispatchEvent(pd1)).toBe(true);
    expect(thumb.hasAttribute(REVEALED_ATTR)).toBe(true);

    // 1st click: swallowed
    const clk1 = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    expect(!thumb.dispatchEvent(clk1)).toBe(true);

    // 2nd activation: pointerdown passes through
    const pd2 = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 });
    expect(!thumb.dispatchEvent(pd2)).toBe(false);

    // 2nd click: passes through
    const clk2 = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    expect(!thumb.dispatchEvent(clk2)).toBe(false);
  });
});

describe('reveal resolution geometry: no DOM-order-first guesses', () => {
  // Per-element rects. A single prototype-level mock keyed by element avoids
  // instance-level spyOn collisions in happy-dom.
  const rects = new Map<Element, DOMRect>();

  function setRect(el: HTMLElement, width: number, height: number, top: number, left: number): void {
    rects.set(el, {
      width,
      height,
      top,
      left,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    });
  }

  function rowOfThreeThumbs(): { t1: HTMLImageElement; t2: HTMLImageElement; t3: HTMLImageElement } {
    document.body.innerHTML = `
      <div id="wrapper">
        <div class="card" id="card1"><img id="t1" src="a.png"></div>
        <div class="card" id="card2"><img id="t2" src="b.png"></div>
        <div class="card" id="card3"><img id="t3" src="c.png"></div>
      </div>
    `;
    const t1 = document.querySelector('#t1') as HTMLImageElement;
    const t2 = document.querySelector('#t2') as HTMLImageElement;
    const t3 = document.querySelector('#t3') as HTMLImageElement;
    setRect(t1, 240, 160, 50, 0);
    setRect(t2, 240, 160, 50, 240);
    setRect(t3, 240, 160, 50, 480);
    setRect(document.querySelector('#card1') as HTMLElement, 240, 160, 50, 0);
    setRect(document.querySelector('#card2') as HTMLElement, 240, 160, 50, 240);
    setRect(document.querySelector('#card3') as HTMLElement, 240, 160, 50, 480);
    return { t1, t2, t3 };
  }

  beforeEach(() => {
    document.body.innerHTML = '';
    rects.clear();
    // happy-dom's hit-testing is naive (returns unrelated nodes); real
    // browsers only include elements whose box contains the point. Neutralize
    // the stack path so these tests exercise the target-based resolver in
    // isolation. spyOn throws loudly if the property is not overridable, so a
    // non-inert stack can never pass silently.
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(null);
    if (typeof (document as unknown as { elementsFromPoint?: unknown }).elementsFromPoint === 'function') {
      vi.spyOn(document, 'elementsFromPoint').mockReturnValue([]);
    }
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return rects.get(this) ?? { width: 240, height: 160, top: 0, left: 0, right: 240, bottom: 160, x: 0, y: 0, toJSON: () => ({}) };
    });
  });

  afterEach(() => {
    teardownRevealHandlers();
    vi.restoreAllMocks();
  });

  it.each(['click', 'both'] as const)('keeps a same-card replacement video locked after the pointer leaves in %s mode', async (mode) => {
    vi.useFakeTimers();
    try {
      const { t1, t2 } = rowOfThreeThumbs();
      const card = document.querySelector('#card1') as HTMLElement;
      const neighbor = document.querySelector('#card2') as HTMLElement;
      setRect(document.querySelector('#wrapper') as HTMLElement, 720, 200, 0, 0);
      setupRevealHandlers(mode);
      t1.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 100, clientY: 100 }));
      t1.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 }));
      t1.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 }));
      document.body.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 1000, clientY: 1000 }));

      const video = document.createElement('video');
      setRect(video, 240, 160, 50, 0);
      card.replaceChildren(video);
      const neighborVideo = document.createElement('video');
      // Even geometric overlap must not transfer the lock across card roots.
      setRect(neighborVideo, 240, 160, 50, 0);
      neighbor.appendChild(neighborVideo);
      const overlay = document.createElement('video');
      setRect(overlay, 240, 160, 50, 0);
      document.body.appendChild(overlay);
      await vi.advanceTimersByTimeAsync(0);

      expect(video.hasAttribute(REVEALED_ATTR)).toBe(true);
      expect(t2.hasAttribute(REVEALED_ATTR)).toBe(false);
      expect(neighborVideo.hasAttribute(REVEALED_ATTR)).toBe(false);
      expect(overlay.hasAttribute(REVEALED_ATTR)).toBe(false);

      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 1000, clientY: 1000 }));
      expect(video.hasAttribute(REVEALED_ATTR)).toBe(false);
      const laterVideo = document.createElement('video');
      setRect(laterVideo, 240, 160, 50, 0);
      card.replaceChildren(laterVideo);
      await vi.advanceTimersByTimeAsync(0);
      expect(laterVideo.hasAttribute(REVEALED_ATTR)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not transfer a lock to a replacement card at the same position', async () => {
    vi.useFakeTimers();
    try {
      const { t1 } = rowOfThreeThumbs();
      setRect(document.querySelector('#wrapper') as HTMLElement, 720, 200, 0, 0);
      setupRevealHandlers('click');
      t1.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 }));
      const replacementCard = document.createElement('article');
      const video = document.createElement('video');
      setRect(replacementCard, 240, 160, 50, 0);
      setRect(video, 240, 160, 50, 0);
      replacementCard.appendChild(video);
      document.querySelector('#card1')!.replaceWith(replacementCard);
      await vi.advanceTimersByTimeAsync(0);
      expect(video.hasAttribute(REVEALED_ATTR)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('thin row wrapper (height < 16px): pointer over the strip reveals no video', () => {
    const { t1, t2, t3 } = rowOfThreeThumbs();
    const wrapper = document.querySelector('#wrapper') as HTMLElement;
    setRect(wrapper, 720, 8, 0, 0); // thin strip; cards start at y=50

    setupRevealHandlers('hover');

    wrapper.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 360, clientY: 4 }));

    expect(t1.hasAttribute(REVEALED_ATTR)).toBe(false);
    expect(t2.hasAttribute(REVEALED_ATTR)).toBe(false);
    expect(t3.hasAttribute(REVEALED_ATTR)).toBe(false);
  });

  it('0x0 wrapper with a row of cards: pointer over wrapper text reveals no video', () => {
    const { t1, t2, t3 } = rowOfThreeThumbs();
    const wrapper = document.querySelector('#wrapper') as HTMLElement;
    setRect(wrapper, 0, 0, 0, 0);
    const label = document.createElement('span');
    label.textContent = 'section';
    wrapper.prepend(label);
    setRect(label, 100, 20, 0, 0);

    setupRevealHandlers('hover');

    label.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 50, clientY: 10 }));

    expect(t1.hasAttribute(REVEALED_ATTR)).toBe(false);
    expect(t2.hasAttribute(REVEALED_ATTR)).toBe(false);
    expect(t3.hasAttribute(REVEALED_ATTR)).toBe(false);
  });

  it('large section wrapper: pointer over the section header reveals no video (no DOM-order-first guess)', () => {
    const { t1, t2, t3 } = rowOfThreeThumbs();
    const wrapper = document.querySelector('#wrapper') as HTMLElement;
    const header = document.createElement('h2');
    header.textContent = 'Recommended';
    wrapper.prepend(header);
    setRect(wrapper, 1280, 400, 0, 0);
    setRect(header, 400, 30, 0, 0); // header sits above the cards, no overlap

    setupRevealHandlers('hover');

    header.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 200, clientY: 15 }));

    expect(t1.hasAttribute(REVEALED_ATTR)).toBe(false);
    expect(t2.hasAttribute(REVEALED_ATTR)).toBe(false);
    expect(t3.hasAttribute(REVEALED_ATTR)).toBe(false);
  });

  it('hovering a card inside a row reveals only that card', () => {
    const { t1, t2, t3 } = rowOfThreeThumbs();
    setRect(document.querySelector('#wrapper') as HTMLElement, 720, 200, 0, 0);

    setupRevealHandlers('hover');

    // Pointer over the second thumb (left 240..480, top 50..210).
    t2.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 360, clientY: 100 }));

    expect(t2.hasAttribute(REVEALED_ATTR)).toBe(true);
    expect(t1.hasAttribute(REVEALED_ATTR)).toBe(false);
    expect(t3.hasAttribute(REVEALED_ATTR)).toBe(false);
  });
});
