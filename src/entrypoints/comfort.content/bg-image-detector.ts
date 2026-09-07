import { isEditableElement } from './editable';

export const BG_IMAGE_ATTR = 'data-comfort-bg-image';

const EXCLUDED_TAGS = new Set(['HTML', 'BODY', 'HEAD', 'SCRIPT', 'STYLE', 'META', 'LINK', 'NOSCRIPT']);
const ATTRIBUTE_FILTER = ['style', 'class', 'src', 'srcset', 'poster'];

let observer: MutationObserver | null = null;
let scanPending = false;
let processingQueue = false;
// Queued frames and observer callbacks belong to the setup that scheduled them.
let generation = 0;
const pendingElements = new Set<Element>();

export function setupBgImageDetector(): void {
  if (observer) return;
  scanDocument();
  observeChanges();
}

export function teardownBgImageDetector(): void {
  generation += 1;
  if (observer) {
    observer.disconnect();
    observer = null;
  }

  pendingElements.clear();
  scanPending = false;
  processingQueue = false;

  document.querySelectorAll(`[${BG_IMAGE_ATTR}]`).forEach((element) => {
    element.removeAttribute(BG_IMAGE_ATTR);
  });
}

function scanDocument(): void {
  const walker = document.createTreeWalker(
    document.body || document.documentElement,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node) => {
        const element = node as Element;
        if (EXCLUDED_TAGS.has(element.tagName)) return NodeFilter.FILTER_REJECT;
        if (isEditableElement(element)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  const batch: Element[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    batch.push(node as Element);
  }

  processBatch(batch, 0, generation);
}

function processBatch(elements: Element[], startIndex: number, scanGeneration: number): void {
  if (scanGeneration !== generation) return;
  const chunkSize = 100;
  const endIndex = Math.min(startIndex + chunkSize, elements.length);

  for (let index = startIndex; index < endIndex; index += 1) {
    syncElementMark(elements[index]);
  }

  if (endIndex < elements.length) {
    requestAnimationFrame(() => processBatch(elements, endIndex, scanGeneration));
  }
}

function syncElementMark(element: Element): void {
  if (!element.isConnected) return;
  if (EXCLUDED_TAGS.has(element.tagName)) return;
  if (isEditableElement(element)) {
    element.removeAttribute(BG_IMAGE_ATTR);
    return;
  }
  if (element.matches('img, picture, video, canvas, svg, iframe')) return;
  if (shouldIgnoreBackgroundElement(element)) {
    element.removeAttribute(BG_IMAGE_ATTR);
    return;
  }

  const backgroundImage = getComputedStyle(element).backgroundImage;
  if (!backgroundImage || backgroundImage === 'none' || !backgroundImage.includes('url(')) {
    element.removeAttribute(BG_IMAGE_ATTR);
    return;
  }

  const rect = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  if (rect.width > viewportWidth * 0.8 && rect.height > viewportHeight * 0.8) {
    element.removeAttribute(BG_IMAGE_ATTR);
    return;
  }

  element.setAttribute(BG_IMAGE_ATTR, 'true');
}

function shouldIgnoreBackgroundElement(element: Element): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (element.childElementCount > 3) return true;

  const textLength = element.textContent?.trim().length ?? 0;
  if (element.childElementCount > 0 && textLength > 0) return true;

  return Boolean(
    element.querySelector('a, button, input, textarea, select, [role="button"], [data-list-item-id]')
  );
}

function observeChanges(): void {
  const observerGeneration = generation;
  observer = new MutationObserver((mutations) => {
    if (observerGeneration !== generation) return;
    for (const mutation of mutations) {
      if (mutation.target instanceof Element) {
        pendingElements.add(mutation.target);
      }
      if (mutation.type === 'attributes') {
        continue;
      }

      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        enqueueElementTree(node);
      }
      for (const node of mutation.removedNodes) {
        if (!(node instanceof Element)) continue;
        enqueueElementTree(node, true);
      }
    }

    if (scanPending) return;
    scanPending = true;
    requestAnimationFrame(() => {
      if (observerGeneration !== generation) return;
      scanPending = false;
      processPendingElements(observerGeneration);
    });
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ATTRIBUTE_FILTER,
  });
}

function enqueueElementTree(root: Element, removed = false): void {
  if (EXCLUDED_TAGS.has(root.tagName)) return;
  if (isEditableElement(root)) return;

  pendingElements.add(root);
  if (removed) return;

  root.querySelectorAll('*').forEach((child) => {
    if (!EXCLUDED_TAGS.has(child.tagName) && !isEditableElement(child)) {
      pendingElements.add(child);
    }
  });
}

function processPendingElements(queueGeneration: number): void {
  if (queueGeneration !== generation) return;
  if (processingQueue) return;
  processingQueue = true;

  const chunkSize = 100;
  const iterator = pendingElements.values();
  let processed = 0;

  while (processed < chunkSize) {
    const next = iterator.next();
    if (next.done) break;

    const element = next.value;
    pendingElements.delete(element);
    syncElementMark(element);
    processed += 1;
  }

  processingQueue = false;

  if (pendingElements.size > 0) {
    requestAnimationFrame(() => processPendingElements(queueGeneration));
  }
}
