import type { RevealMode } from '../../utils/types';
import { REVEALED_ATTR } from './styles';

const MEDIA_SELECTORS = 'img, video, picture, canvas, iframe, svg, [data-comfort-bg-image]';
const MAX_CONTAINER_DEPTH = 6;
const MAX_CONTAINER_DELTA = 72;
const MIN_MEDIA_SIZE = 16;

let currentMode: RevealMode = 'click';
let handlersActive = false;
let hoverCluster = new Set<Element>();
let lockedCluster = new Set<Element>();
let swallowedClickCluster = new Set<Element>();

export function setupRevealHandlers(revealMode: RevealMode): void {
  currentMode = revealMode;
  if (handlersActive) return;

  document.addEventListener('click', handleClick, true);
  document.addEventListener('pointerdown', handlePointerDown, true);
  document.addEventListener('pointermove', handlePointerMove, true);
  document.addEventListener('pointerleave', handlePointerLeave, true);
  document.addEventListener('visibilitychange', handleVisibilityChange, true);
  window.addEventListener('pagehide', clearAllRevealed, true);
  window.addEventListener('pageshow', clearAllRevealed, true);
  handlersActive = true;
}

export function updateRevealMode(revealMode: RevealMode): void {
  if (currentMode === revealMode) return;
  currentMode = revealMode;
  clearAllRevealed();
}

export function teardownRevealHandlers(): void {
  if (!handlersActive) return;

  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('pointerdown', handlePointerDown, true);
  document.removeEventListener('pointermove', handlePointerMove, true);
  document.removeEventListener('pointerleave', handlePointerLeave, true);
  document.removeEventListener('visibilitychange', handleVisibilityChange, true);
  window.removeEventListener('pagehide', clearAllRevealed, true);
  window.removeEventListener('pageshow', clearAllRevealed, true);
  handlersActive = false;
  clearAllRevealed();
}

function handleClick(event: MouseEvent): void {
  if (currentMode === 'hover') return;

  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const cluster = findRevealCluster(target);
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

  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const cluster = findRevealCluster(target);
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
  if (currentMode === 'click') return;

  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    clearHoverCluster();
    return;
  }

  const cluster = findRevealCluster(target);
  syncHoverCluster(cluster);
}

function handlePointerLeave(): void {
  clearHoverCluster();
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'hidden') {
    clearAllRevealed();
  }
}

function findRevealCluster(target: HTMLElement): Element[] {
  const mediaElement = findRevealTarget(target);
  if (!mediaElement) return [];

  return collectRevealCluster(mediaElement);
}

function lockCluster(elements: Element[]): void {
  clearLockedCluster();
  for (const element of elements) {
    lockedCluster.add(element);
    syncRevealState(element);
  }
}

function clearLockedCluster(): void {
  for (const element of lockedCluster) {
    lockedCluster.delete(element);
    syncRevealState(element);
  }
}

function syncHoverCluster(nextCluster: Element[]): void {
  const next = new Set(nextCluster);

  for (const element of hoverCluster) {
    if (!next.has(element)) {
      hoverCluster.delete(element);
      syncRevealState(element);
    }
  }

  for (const element of next) {
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
  if (hoverCluster.has(element) || lockedCluster.has(element)) {
    element.setAttribute(REVEALED_ATTR, 'true');
    return;
  }

  element.removeAttribute(REVEALED_ATTR);
}

export function clearAllRevealed(): void {
  clearHoverCluster();
  clearLockedCluster();
  swallowedClickCluster.clear();
  document.querySelectorAll(`[${REVEALED_ATTR}]`).forEach((element) => {
    element.removeAttribute(REVEALED_ATTR);
  });
}

function findRevealTarget(target: HTMLElement): Element | null {
  const directMedia = target.closest(MEDIA_SELECTORS);
  if (directMedia) return directMedia;

  let container: HTMLElement | null = target;
  let depth = 0;

  while (container && depth < MAX_CONTAINER_DEPTH) {
    const descendantMedia = findBestDescendantMedia(container);
    if (descendantMedia) return descendantMedia;

    container = container.parentElement;
    depth += 1;
  }

  return null;
}

function findBestDescendantMedia(container: HTMLElement): Element | null {
  const candidates = Array.from(container.querySelectorAll(MEDIA_SELECTORS));
  const containerRect = container.getBoundingClientRect();

  return (
    candidates.find((candidate) => isMediaSizedLikeContainer(containerRect, candidate)) ??
    findMediaCoveringContainer(containerRect, candidates) ??
    null
  );
}

function findMediaCoveringContainer(containerRect: DOMRect, candidates: Element[]): Element | null {
  const coveringCandidates = candidates
    .map((candidate) => ({ candidate, rect: candidate.getBoundingClientRect() }))
    .filter(({ rect }) => doesMediaCoverContainer(containerRect, rect))
    .sort((left, right) => getRectArea(left.rect) - getRectArea(right.rect));

  return coveringCandidates[0]?.candidate ?? null;
}

function collectRevealCluster(primary: Element): Element[] {
  const cluster = new Set<Element>();
  const primaryRect = primary.getBoundingClientRect();
  const container = findClusterContainer(primary, primaryRect);
  const candidates = Array.from(container.querySelectorAll(MEDIA_SELECTORS));

  for (const candidate of candidates) {
    if (isSameMediaRegion(primaryRect, candidate)) {
      cluster.add(candidate);
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

  while (current && depth < MAX_CONTAINER_DEPTH) {
    if (isContainerSizedLikeMedia(primaryRect, current)) {
      best = current;
    }

    current = current.parentElement;
    depth += 1;
  }

  return best ?? document;
}

function isMediaSizedLikeContainer(containerRect: DOMRect, media: Element): boolean {
  const mediaRect = media.getBoundingClientRect();

  if (mediaRect.width < MIN_MEDIA_SIZE || mediaRect.height < MIN_MEDIA_SIZE) return false;

  const widthDelta = Math.abs(containerRect.width - mediaRect.width);
  const heightDelta = Math.abs(containerRect.height - mediaRect.height);

  return widthDelta <= MAX_CONTAINER_DELTA && heightDelta <= MAX_CONTAINER_DELTA;
}

function doesMediaCoverContainer(containerRect: DOMRect, mediaRect: DOMRect): boolean {
  if (mediaRect.width < MIN_MEDIA_SIZE || mediaRect.height < MIN_MEDIA_SIZE) return false;

  const containerArea = getRectArea(containerRect);
  if (containerArea === 0) return false;

  return getRectIntersectionArea(containerRect, mediaRect) / containerArea >= 0.9;
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

function isContainerSizedLikeMedia(primaryRect: DOMRect, container: Element): boolean {
  const containerRect = container.getBoundingClientRect();
  if (containerRect.width < MIN_MEDIA_SIZE || containerRect.height < MIN_MEDIA_SIZE) return false;

  const widthDelta = Math.abs(primaryRect.width - containerRect.width);
  const heightDelta = Math.abs(primaryRect.height - containerRect.height);
  const leftDelta = Math.abs(primaryRect.left - containerRect.left);
  const topDelta = Math.abs(primaryRect.top - containerRect.top);

  return (
    widthDelta <= MAX_CONTAINER_DELTA &&
    heightDelta <= MAX_CONTAINER_DELTA &&
    leftDelta <= MAX_CONTAINER_DELTA &&
    topDelta <= MAX_CONTAINER_DELTA
  );
}

function collectFilteredMediaAncestors(primary: Element, primaryRect: DOMRect): Element[] {
  const ancestors: Element[] = [];
  let current = primary.parentElement;
  let depth = 0;

  while (current && depth < MAX_CONTAINER_DEPTH) {
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
  const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
  const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
  return width * height;
}

function getRectArea(rect: DOMRect): number {
  return rect.width * rect.height;
}
