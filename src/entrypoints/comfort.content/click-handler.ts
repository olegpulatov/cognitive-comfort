import type { RevealMode } from '../../utils/types';
import { REVEALED_ATTR } from './styles';

const MEDIA_SELECTORS = 'img, video, picture, canvas, iframe, svg, [data-comfort-bg-image], [style*="background-image"], [style*="background:"]';
const MAX_CONTAINER_DEPTH = 6;
const MAX_CONTAINER_DELTA = 72;
const MIN_MEDIA_SIZE = 16;
const MAX_CARD_DIMENSION = 1200;

const EXCLUDED_CONTAINER_TAGS: Record<string, true> = {
  HTML: true,
  BODY: true,
  HEAD: true,
  MAIN: true,
  HEADER: true,
  FOOTER: true,
  NAV: true,
  'YTD-APP': true,
  'YTD-PAGE-MANAGER': true,
  'YTD-BROWSE': true,
  'YTD-SEARCH': true,
  'YTD-SECTION-LIST-RENDERER': true,
  'YTD-ITEM-SECTION-RENDERER': true,
  'YTD-TWO-COLUMN-SEARCH-RESULTS-RENDERER': true,
  'YTD-TWO-COLUMN-BROWSE-RESULTS-RENDERER': true,
  'YTD-REEL-SHELF-RENDERER': true,
  'YTD-RICH-SHELF-RENDERER': true,
  'YTD-SHELF-RENDERER': true,
  'YTD-RICH-GRID-RENDERER': true,
  'YTD-GRID-RENDERER': true,
  'YTD-EXPANDED-SHELF-CONTENTS-RENDERER': true,
  'YTD-HORIZONTAL-CARD-LIST-RENDERER': true,
  'YTD-VERTICAL-LIST-RENDERER': true,
};

const CARD_BOUNDARY_TAGS: Record<string, true> = {
  ARTICLE: true,
  LI: true,
  FIGURE: true,
  'YTD-REEL-ITEM-RENDERER': true,
  'YTD-RICH-ITEM-RENDERER': true,
  'YTD-VIDEO-RENDERER': true,
  'YTD-GRID-VIDEO-RENDERER': true,
  'YTD-COMPACT-VIDEO-RENDERER': true,
  'YTD-PLAYLIST-RENDERER': true,
  'YTD-RADIO-RENDERER': true,
  'YTD-CHANNEL-RENDERER': true,
  'YTD-POST-RENDERER': true,
  'YTD-THUMBNAIL': true,
};

let currentMode: RevealMode = 'click';
let handlersActive = false;
let hoverCluster = new Set<Element>();
let lockedCluster = new Set<Element>();
let swallowedClickCluster = new Set<Element>();
let lastPointerX = 0;
let lastPointerY = 0;
let lastPointerKnown = false;
let reconnectTimer: number | null = null;
let observer: MutationObserver | null = null;

function isElementNode(value: unknown): value is Element {
  return typeof value === 'object' && value !== null && 'nodeType' in value && (value as Node).nodeType === 1;
}

export function setupRevealHandlers(revealMode: RevealMode): void {
  currentMode = revealMode;
  if (handlersActive) return;

  document.addEventListener('pointerdown', handlePointerDown, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('pointermove', handlePointerMove, true);
  document.addEventListener('visibilitychange', handleVisibilityChange, true);
  window.addEventListener('blur', handleWindowBlur, true);
  window.addEventListener('pagehide', handlePageHide, true);
  window.addEventListener('pageshow', handlePageShow, true);
  observeMediaMutations();

  handlersActive = true;
}

export function updateRevealMode(revealMode: RevealMode): void {
  if (currentMode === revealMode) return;
  currentMode = revealMode;
  clearAllRevealed();
}

export function teardownRevealHandlers(): void {
  if (!handlersActive) return;

  document.removeEventListener('pointerdown', handlePointerDown, true);
  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('pointermove', handlePointerMove, true);
  document.removeEventListener('visibilitychange', handleVisibilityChange, true);
  window.removeEventListener('blur', handleWindowBlur, true);
  window.removeEventListener('pagehide', handlePageHide, true);
  window.removeEventListener('pageshow', handlePageShow, true);
  disconnectMediaObserver();
  lastPointerKnown = false;

  handlersActive = false;
  clearAllRevealed();
}

function handleClick(event: MouseEvent): void {
  if (currentMode === 'hover') return;

  const target = isElementNode(event.target) ? event.target : null;
  const point = { x: event.clientX, y: event.clientY };
  const cluster = findRevealCluster(target, point);
  if (cluster.length === 0) {
    clearLockedCluster();
    return;
  }

  if (swallowedClickCluster.size > 0 && cluster.every((element) => swallowedClickCluster.has(element))) {
    swallowedClickCluster.clear();
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    return;
  }

  if (cluster.every((element) => lockedCluster.has(element))) {
    return;
  }
}

function handlePointerDown(event: PointerEvent): void {
  if (currentMode === 'hover') return;

  const target = isElementNode(event.target) ? event.target : null;
  const point = { x: event.clientX, y: event.clientY };
  const cluster = findRevealCluster(target, point);
  if (cluster.length === 0) {
    clearLockedCluster();
    return;
  }

  if (currentMode === 'both' && cluster.some((element) => hoverCluster.has(element))) {
    lockCluster(cluster);
    swallowedClickCluster.clear();
    return;
  }

  if (cluster.every((element) => lockedCluster.has(element))) {
    swallowedClickCluster.clear();
    return;
  }

  lockCluster(cluster);
  swallowedClickCluster = new Set(cluster);
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function handlePointerMove(event: PointerEvent): void {
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
  lastPointerKnown = true;

  if (currentMode === 'click') return;

  const target = isElementNode(event.target) ? event.target : null;
  const point = { x: lastPointerX, y: lastPointerY };
  const cluster = findRevealCluster(target, point);
  if (cluster.length > 0) {
    syncHoverCluster(cluster);
    return;
  }

  clearHoverIfCursorLeft();
}

function clearHoverIfCursorLeft(): void {
  if (!lastPointerKnown) {
    clearHoverCluster();
    return;
  }

  // 1. Is there media currently at the cursor coordinates?
  const currentMedia = findRevealCluster(null, { x: lastPointerX, y: lastPointerY });
  if (currentMedia.length > 0) {
    syncHoverCluster(currentMedia);
    return;
  }

  // 2. Is the cursor still inside the bounding box of an existing hovered element?
  for (const element of hoverCluster) {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;

    const within =
      lastPointerX >= rect.left &&
      lastPointerX <= rect.right &&
      lastPointerY >= rect.top &&
      lastPointerY <= rect.bottom;

    if (within) {
      return;
    }
  }

  clearHoverCluster();
}

function handleWindowBlur(): void {
  clearHoverCluster();
}

function handlePageHide(): void {
  clearAllRevealed();
}

function handlePageShow(): void {
  clearAllRevealed();
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'hidden') {
    clearAllRevealed();
  }
}

function observeMediaMutations(): void {
  if (observer) return;

  observer = new MutationObserver(() => {
    if (currentMode === 'click') return;
    if (!lastPointerKnown) return;

    scheduleReconcile(0);
  });

  attachObserver();
}

function attachObserver(): void {
  if (!observer) return;
  const target = document.body || document.documentElement;
  if (!target) return;

  try {
    observer.observe(target, { childList: true, subtree: true });
  } catch {
    disconnectMediaObserver();
  }
}

function disconnectMediaObserver(): void {
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  observer?.disconnect();
  observer = null;
}

function scheduleReconcile(delayMs: number): void {
  if (reconnectTimer !== null) return;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    reconcileAtPointer();
    attachObserver();
  }, delayMs);
}

function reconcileAtPointer(): void {
  if (currentMode === 'click' || !lastPointerKnown) return;

  const cluster = findRevealCluster(null, { x: lastPointerX, y: lastPointerY });
  if (cluster.length > 0) {
    mergeHoverCluster(cluster);
  }
}

function lockCluster(elements: Element[]): void {
  clearLockedCluster();
  for (const element of elements) {
    lockedCluster.add(element);
    syncRevealState(element);
  }
}

function clearLockedCluster(): void {
  const previous = [...lockedCluster];
  lockedCluster.clear();
  for (const element of previous) {
    syncRevealState(element);
  }
}

function syncHoverCluster(nextCluster: Element[]): void {
  const nextSet = new Set(nextCluster);
  const elementsToUpdate = new Set<Element>([...hoverCluster, ...nextSet]);

  hoverCluster = nextSet;

  for (const element of elementsToUpdate) {
    syncRevealState(element);
  }
}

function mergeHoverCluster(newElements: Element[]): void {
  for (const element of newElements) {
    if (!hoverCluster.has(element)) {
      hoverCluster.add(element);
      syncRevealState(element);
    }
  }
}

function clearHoverCluster(): void {
  syncHoverCluster([]);
}

function syncRevealState(element: Element): void {
  const shouldReveal = hoverCluster.has(element) || lockedCluster.has(element);
  if (shouldReveal) {
    element.setAttribute(REVEALED_ATTR, 'true');
  } else {
    element.removeAttribute(REVEALED_ATTR);
  }
}

export function clearAllRevealed(): void {
  hoverCluster.clear();
  lockedCluster.clear();
  swallowedClickCluster.clear();

  const revealed = document.querySelectorAll(`[${REVEALED_ATTR}]`);
  for (const element of revealed) {
    element.removeAttribute(REVEALED_ATTR);
  }
}

function isExcludedContainer(el: Element): boolean {
  if (EXCLUDED_CONTAINER_TAGS[el.tagName]) return true;
  if (
    el.id === 'contents' ||
    el.id === 'primary' ||
    el.id === 'columns' ||
    el.id === 'items' ||
    el.id === 'scroll-container' ||
    el.id === 'grid-container' ||
    el.id === 'chips' ||
    el.id === 'header' ||
    el.id === 'guide-inner-content'
  ) {
    return true;
  }
  return false;
}

function isCardOrPlayerSized(el: Element): boolean {
  if (isExcludedContainer(el)) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return true;
  return rect.width <= MAX_CARD_DIMENSION && rect.height <= MAX_CARD_DIMENSION;
}

function getElementsUnderPoint(x: number, y: number): Element[] {
  const result: Element[] = [];
  const seen = new Set<Element>();

  const add = (el: Element | null | undefined) => {
    if (el && !seen.has(el) && !isExcludedContainer(el)) {
      seen.add(el);
      result.push(el);
    }
  };

  try {
    if (typeof document.elementsFromPoint === 'function') {
      for (const el of document.elementsFromPoint(x, y)) {
        add(el);
        if (el.shadowRoot) {
          const shadowRootObj = el.shadowRoot as unknown;
          if (
            shadowRootObj &&
            typeof shadowRootObj === 'object' &&
            'elementsFromPoint' in shadowRootObj &&
            typeof (shadowRootObj as { elementsFromPoint: unknown }).elementsFromPoint === 'function'
          ) {
            try {
              const shadowElements = (shadowRootObj as { elementsFromPoint: (px: number, py: number) => Element[] }).elementsFromPoint(x, y);
              for (const shadowEl of shadowElements) {
                add(shadowEl);
              }
            } catch {
              // Shadow query optional
            }
          }
        }
      }
    }
  } catch {
    // Fallback below
  }

  if (result.length === 0) {
    try {
      if (typeof document.elementFromPoint === 'function') {
        add(document.elementFromPoint(x, y));
      }
    } catch {
      // Ignore
    }
  }

  return result;
}

function collectBoundedMediaCandidates(root: Element): Element[] {
  if (isExcludedContainer(root)) return [];

  const candidates: Element[] = [];

  if (root.matches?.(MEDIA_SELECTORS)) {
    candidates.push(root);
  }

  try {
    const descendants = root.querySelectorAll?.(MEDIA_SELECTORS);
    if (descendants) {
      for (const descendant of descendants) {
        candidates.push(descendant);
      }
    }
  } catch {
    // Ignore querySelectorAll failures on detached/special nodes
  }

  if (root.shadowRoot) {
    try {
      const shadowMedia = root.shadowRoot.querySelectorAll?.(MEDIA_SELECTORS);
      if (shadowMedia) {
        for (const m of shadowMedia) {
          candidates.push(m);
        }
      }
    } catch {
      // Ignore shadow queries
    }
  }

  return candidates;
}

function findRevealTarget(target: Element): Element | null {
  const directMedia = target.closest(MEDIA_SELECTORS);
  if (directMedia) return directMedia;

  let container: Element | null = target;
  let depth = 0;

  while (container && depth < MAX_CONTAINER_DEPTH && !isExcludedContainer(container)) {
    const descendantMedia = findBestDescendantMedia(container);
    if (descendantMedia) return descendantMedia;

    container = container.parentElement;
    depth += 1;
  }

  return null;
}

function findBestDescendantMedia(container: Element): Element | null {
  const candidates = collectBoundedMediaCandidates(container);
  if (candidates.length === 0) return null;

  const containerRect = container.getBoundingClientRect();
  if (containerRect.width < MIN_MEDIA_SIZE || containerRect.height < MIN_MEDIA_SIZE) {
    return candidates[0] ?? null;
  }

  return findMediaCoveringContainer(containerRect, candidates) ?? candidates[0] ?? null;
}

function findMediaCoveringContainer(containerRect: DOMRect, candidates: Element[]): Element | null {
  const containerArea = containerRect.width * containerRect.height;
  if (containerArea === 0) return null;

  const coveringCandidates = candidates
    .map((candidate) => ({ candidate, rect: candidate.getBoundingClientRect() }))
    .filter(({ rect }) => doesMediaCoverContainer(containerRect, rect))
    .sort((left, right) => left.rect.width * left.rect.height - right.rect.width * right.rect.height);

  return coveringCandidates[0]?.candidate ?? null;
}

function doesMediaCoverContainer(containerRect: DOMRect, mediaRect: DOMRect): boolean {
  if (mediaRect.width < MIN_MEDIA_SIZE || mediaRect.height < MIN_MEDIA_SIZE) return false;

  const containerArea = containerRect.width * containerRect.height;
  if (containerArea === 0) return false;

  return getRectIntersectionArea(containerRect, mediaRect) / containerArea >= 0.9;
}

function findRevealCluster(
  target: Element | null,
  point: { x: number; y: number } | null
): Element[] {
  const cluster = new Set<Element>();

  // 1. Target-based resolution
  if (target && isElementNode(target)) {
    const targetMedia = findRevealTarget(target);
    if (targetMedia) {
      for (const m of collectRevealCluster(targetMedia, point)) {
        cluster.add(m);
      }
    }
  }

  // 2. Point-based visual stack resolution (penetrates overlays & floating preview players)
  if (point) {
    const stack = getElementsUnderPoint(point.x, point.y);
    for (const el of stack) {
      if (el.matches?.(MEDIA_SELECTORS)) {
        for (const m of collectRevealCluster(el, point)) {
          cluster.add(m);
        }
      } else if (isCardOrPlayerSized(el)) {
        const targetMedia = findRevealTarget(el);
        if (targetMedia) {
          for (const m of collectRevealCluster(targetMedia, point)) {
            cluster.add(m);
          }
        }
      }
    }
  }

  return [...cluster];
}

function collectRevealCluster(
  primary: Element,
  point: { x: number; y: number } | null
): Element[] {
  const cluster = new Set<Element>();
  const primaryRect = primary.getBoundingClientRect();
  const container = findClusterContainer(primary, primaryRect);
  const candidates =
    isElementNode(container) && !isExcludedContainer(container)
      ? collectBoundedMediaCandidates(container)
      : [];

  for (const candidate of candidates) {
    if (isSameMediaRegion(primaryRect, candidate)) {
      cluster.add(candidate);
    }
  }

  if (point) {
    for (const candidate of candidates) {
      if (isUnderCursorInStack(primaryRect, candidate, point)) {
        cluster.add(candidate);
      }
    }
  }

  if (cluster.size === 0) {
    cluster.add(primary);
  }

  for (const ancestor of collectFilteredMediaAncestors(primary, primaryRect)) {
    cluster.add(ancestor);
  }

  return [...cluster];
}

function findClusterContainer(primary: Element, primaryRect: DOMRect): ParentNode {
  let best: Element | null = primary.parentElement;
  let current = primary.parentElement;
  let depth = 0;

  while (current && depth < MAX_CONTAINER_DEPTH && !isExcludedContainer(current)) {
    if (isContainerSizedLikeMedia(primaryRect, current)) {
      best = current;
    }

    if (CARD_BOUNDARY_TAGS[current.tagName]) {
      best = current;
      break;
    }

    current = current.parentElement;
    depth += 1;
  }
  return best ?? document;
}

function isSameMediaRegion(primaryRect: DOMRect, media: Element): boolean {
  const mediaRect = media.getBoundingClientRect();
  if (mediaRect.width < MIN_MEDIA_SIZE || mediaRect.height < MIN_MEDIA_SIZE) return false;

  const widthDelta = Math.abs(primaryRect.width - mediaRect.width);
  const heightDelta = Math.abs(primaryRect.height - mediaRect.height);
  const leftDelta = Math.abs(primaryRect.left - mediaRect.left);
  const topDelta = Math.abs(primaryRect.top - mediaRect.top);

  return (
    widthDelta <= MAX_CONTAINER_DELTA &&
    heightDelta <= MAX_CONTAINER_DELTA &&
    leftDelta <= MAX_CONTAINER_DELTA &&
    topDelta <= MAX_CONTAINER_DELTA
  );
}

function isUnderCursorInStack(
  primaryRect: DOMRect,
  media: Element,
  point: { x: number; y: number }
): boolean {
  const mediaRect = media.getBoundingClientRect();

  // If newly mounted with 0 dimensions, allow if primary rect is valid
  if (mediaRect.width === 0 && mediaRect.height === 0) {
    return true;
  }

  if (mediaRect.width < MIN_MEDIA_SIZE || mediaRect.height < MIN_MEDIA_SIZE) return false;

  if (point.x < mediaRect.left || point.x > mediaRect.right) return false;
  if (point.y < mediaRect.top || point.y > mediaRect.bottom) return false;

  if (primaryRect.width >= MIN_MEDIA_SIZE && primaryRect.height >= MIN_MEDIA_SIZE) {
    if (mediaRect.width * mediaRect.height > primaryRect.width * primaryRect.height * 4) return false;

    const overlap = getRectIntersectionArea(primaryRect, mediaRect);
    if (overlap === 0) return false;

    const minArea = Math.min(primaryRect.width * primaryRect.height, mediaRect.width * mediaRect.height);
    return minArea > 0 && overlap / minArea >= 0.3;
  }

  return true;
}

function isContainerSizedLikeMedia(primaryRect: DOMRect, container: Element): boolean {
  if (isExcludedContainer(container)) return false;

  const containerRect = container.getBoundingClientRect();
  if (containerRect.width < MIN_MEDIA_SIZE || containerRect.height < MIN_MEDIA_SIZE) return false;

  const widthDelta = Math.abs(containerRect.width - primaryRect.width);
  const heightDelta = Math.abs(containerRect.height - primaryRect.height);

  return widthDelta <= MAX_CONTAINER_DELTA && heightDelta <= MAX_CONTAINER_DELTA;
}

function collectFilteredMediaAncestors(primary: Element, primaryRect: DOMRect): Element[] {
  const ancestors: Element[] = [];
  let current: Element | null = primary.parentElement;
  let depth = 0;

  while (current && depth < MAX_CONTAINER_DEPTH && !isExcludedContainer(current)) {
    if (isContainerSizedLikeMedia(primaryRect, current) && hasBlurFilter(current)) {
      ancestors.push(current);
    }
    current = current.parentElement;
    depth += 1;
  }

  return ancestors;
}

function hasBlurFilter(element: Element): boolean {
  return getComputedStyle(element).filter.includes('blur(');
}

function getRectIntersectionArea(left: DOMRect, right: DOMRect): number {
  const leftX = Math.max(left.left, right.left);
  const rightX = Math.min(left.right, right.right);
  const topY = Math.max(left.top, right.top);
  const bottomY = Math.min(left.bottom, right.bottom);

  if (rightX <= leftX || bottomY <= topY) return 0;
  return (rightX - leftX) * (bottomY - topY);
}
