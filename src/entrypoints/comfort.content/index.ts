import type { ComfortSettings } from '../../utils/types';
import { getDomain } from '../../utils/domain';
import {
  COMFORT_SETTINGS_CHANGED_MESSAGE,
  getSettings,
  isActiveForSite,
  isEmojiBlockedForSite,
  onSettingsChange,
} from '../../utils/storage';
import {
  clearAllRevealed,
  setupRevealHandlers,
  teardownRevealHandlers,
  updateRevealMode,
} from './click-handler';
import { setupBgImageDetector, teardownBgImageDetector } from './bg-image-detector';
import { setupEmojiBlocker, teardownEmojiBlocker } from './emoji-blocker';
import { scheduleWhenBodyReady } from './dom-ready';
import { generateEmojiStyles, generateStyles, PEEK_CONTAINER_ATTR } from './styles';

let styleElement: HTMLStyleElement | null = null;
let emojiStyleElement: HTMLStyleElement | null = null;
let revealHandlersActive = false;
let bgDetectorActive = false;
let emojiBlockerActive = false;
let cancelPendingBgDetector: (() => void) | null = null;
let cancelPendingEmojiBlocker: (() => void) | null = null;
let peekPulseTimer: ReturnType<typeof setTimeout> | null = null;
let peekShortcutActive = false;

const currentDomain = getDomain(window.location.href);

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  main: async () => {
    let initialized = false;
    let refreshGeneration = 0;
    let appliedSettingsKey = '';

    const requestSettingsRefresh = (): void => {
      const generation = ++refreshGeneration;
      if (!initialized) return;

      void getSettings()
        .then((nextSettings) => {
          if (generation !== refreshGeneration) return;

          const nextSettingsKey = JSON.stringify(nextSettings);
          if (nextSettingsKey === appliedSettingsKey) return;

          applySettings(nextSettings);
          appliedSettingsKey = nextSettingsKey;
        })
        .catch(() => {
          // The next settings notification can retry a failed read or apply.
        });
    };

    onSettingsChange(() => requestSettingsRefresh());
    browser.runtime.onMessage.addListener((message) => {
      if (message?.type === COMFORT_SETTINGS_CHANGED_MESSAGE) requestSettingsRefresh();
    });

    const settings = await getSettings();
    applySettings(settings);
    appliedSettingsKey = JSON.stringify(settings);
    initialized = true;
    if (refreshGeneration > 0) requestSettingsRefresh();

    setupPeekHandler();
  },
});

const PEEK_PREV_FILTER_ATTR = 'data-comfort-peek-prev-filter';
const PEEK_PREV_PRIORITY_ATTR = 'data-comfort-peek-prev-priority';
const PEEK_MEDIA_QUERY = '[data-comfort-bg-image], img, picture, video, canvas, iframe, svg';
const PEEK_PULSE_DURATION_MS = 350;
const PEEK_RELEASE_DELAY_MS = 90;
const PEEK_FAILSAFE_DURATION_MS = 5000;
const PEEK_MAX_ANCESTOR_DEPTH = 6;
const PEEK_SIZE_DELTA = 72;
const PEEK_MIN_MEDIA_SIZE = 16;

function setupPeekHandler(): void {
  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === 'peek-pulse') {
      pulsePeek();
    }
  });

  document.addEventListener('keydown', handleShortcutFallback, true);
  document.addEventListener('keyup', handleShortcutRelease, true);
  window.addEventListener('blur', stopShortcutPeek);
}

function handleShortcutFallback(event: KeyboardEvent): void {
  if (!isPeekShortcutEvent(event)) return;

  event.preventDefault();
  event.stopPropagation();

  if (event.repeat && peekShortcutActive) return;

  peekShortcutActive = true;
  startPeek();
  schedulePeekEnd(PEEK_FAILSAFE_DURATION_MS);
}

function handleShortcutRelease(event: KeyboardEvent): void {
  if (!peekShortcutActive || !isPeekShortcutRelease(event)) return;

  event.preventDefault();
  event.stopPropagation();
  stopShortcutPeek();
}

function isPeekShortcutEvent(event: KeyboardEvent): boolean {
  const usesPrimaryModifiers = (event.metaKey || event.ctrlKey) && event.shiftKey;
  return usesPrimaryModifiers && !event.altKey && event.key.toLowerCase() === 'a';
}

function isPeekShortcutRelease(event: KeyboardEvent): boolean {
  return ['a', 'control', 'meta', 'shift'].includes(event.key.toLowerCase());
}

function stopShortcutPeek(): void {
  if (!peekShortcutActive) return;

  peekShortcutActive = false;
  schedulePeekEnd(PEEK_RELEASE_DELAY_MS);
}

function pulsePeek(): void {
  startPeek();
  schedulePeekEnd(peekShortcutActive ? PEEK_FAILSAFE_DURATION_MS : PEEK_PULSE_DURATION_MS);
}

function startPeek(): void {
  if (peekPulseTimer) {
    clearTimeout(peekPulseTimer);
    peekPulseTimer = null;
  }

  if (document.documentElement.hasAttribute('data-comfort-peek')) return;

  document.documentElement.setAttribute('data-comfort-peek', '');
  syncPeekContainers();
}

function schedulePeekEnd(delayMs: number): void {
  if (peekPulseTimer) clearTimeout(peekPulseTimer);

  peekPulseTimer = setTimeout(() => {
    document.documentElement.removeAttribute('data-comfort-peek');
    clearPeekContainers();
    peekPulseTimer = null;
  }, delayMs);
}

function syncPeekContainers(): void {
  clearPeekContainers();

  for (const media of document.querySelectorAll(PEEK_MEDIA_QUERY)) {
    const rect = media.getBoundingClientRect();
    if (rect.width < PEEK_MIN_MEDIA_SIZE || rect.height < PEEK_MIN_MEDIA_SIZE) continue;

    if (hasNonZeroBlurFilter(media)) {
      forceUnblurInline(media);
    }

    let current = media.parentElement;
    let depth = 0;

    while (current && depth < PEEK_MAX_ANCESTOR_DEPTH) {
      if (isContainerSizedLikeMedia(rect, current) && hasNonZeroBlurFilter(current)) {
        current.setAttribute(PEEK_CONTAINER_ATTR, 'true');
        forceUnblurInline(current);
      }

      current = current.parentElement;
      depth += 1;
    }
  }
}

function clearPeekContainers(): void {
  document.querySelectorAll(`[${PEEK_CONTAINER_ATTR}]`).forEach((element) => {
    element.removeAttribute(PEEK_CONTAINER_ATTR);
  });

  document.querySelectorAll(`[${PEEK_PREV_FILTER_ATTR}]`).forEach((element) => {
    restoreInlineFilter(element);
  });
}

function forceUnblurInline(element: Element): void {
  if (!(element instanceof HTMLElement)) return;
  if (element.hasAttribute(PEEK_PREV_FILTER_ATTR)) return;

  const prevValue = element.style.getPropertyValue('filter');
  const prevPriority = element.style.getPropertyPriority('filter');
  element.setAttribute(PEEK_PREV_FILTER_ATTR, prevValue);
  element.setAttribute(PEEK_PREV_PRIORITY_ATTR, prevPriority);
  element.style.setProperty('filter', 'blur(0px) brightness(1) saturate(1)', 'important');
}

function restoreInlineFilter(element: Element): void {
  if (!(element instanceof HTMLElement)) return;

  const prevValue = element.getAttribute(PEEK_PREV_FILTER_ATTR) ?? '';
  const prevPriority = element.getAttribute(PEEK_PREV_PRIORITY_ATTR) ?? '';
  element.removeAttribute(PEEK_PREV_FILTER_ATTR);
  element.removeAttribute(PEEK_PREV_PRIORITY_ATTR);

  if (prevValue) {
    element.style.setProperty('filter', prevValue, prevPriority);
  } else {
    element.style.removeProperty('filter');
  }
}

function hasNonZeroBlurFilter(element: Element): boolean {
  const filter = getComputedStyle(element).filter;
  const match = filter.match(/blur\(\s*([\d.]+)(px|em|rem)?\s*\)/);
  if (!match) return false;
  return Number.parseFloat(match[1]) > 0;
}

function isContainerSizedLikeMedia(mediaRect: DOMRect, container: Element): boolean {
  const containerRect = container.getBoundingClientRect();

  return (
    Math.abs(mediaRect.width - containerRect.width) <= PEEK_SIZE_DELTA &&
    Math.abs(mediaRect.height - containerRect.height) <= PEEK_SIZE_DELTA &&
    Math.abs(mediaRect.left - containerRect.left) <= PEEK_SIZE_DELTA &&
    Math.abs(mediaRect.top - containerRect.top) <= PEEK_SIZE_DELTA
  );
}

function applySettings(settings: ComfortSettings): void {
  const active = isActiveForSite(settings, currentDomain);
  const emojiBlocked = isEmojiBlockedForSite(settings, currentDomain);

  // Background image detector
  if (active) {
    if (!bgDetectorActive && !cancelPendingBgDetector) {
      cancelPendingBgDetector = scheduleWhenBodyReady(() => {
        cancelPendingBgDetector = null;
        setupBgImageDetector();
        bgDetectorActive = true;
      });
    }
  } else {
    cancelPendingBgDetector?.();
    cancelPendingBgDetector = null;
    if (bgDetectorActive) {
      teardownBgImageDetector();
      bgDetectorActive = false;
    }
  }

  // Blur styles
  updateStyleElement(active ? generateStyles(settings) : '');

  // Reveal handlers (click/hover to show media)
  if (active && !revealHandlersActive) {
    setupRevealHandlers(settings.revealMode);
  } else if (!active && revealHandlersActive) {
    teardownRevealHandlers();
  }
  revealHandlersActive = active;

  if (active) {
    updateRevealMode(settings.revealMode);
  } else {
    clearAllRevealed();
  }

  // Emoji blocker
  if (emojiBlocked) {
    if (!emojiBlockerActive && !cancelPendingEmojiBlocker) {
      cancelPendingEmojiBlocker = scheduleWhenBodyReady(() => {
        cancelPendingEmojiBlocker = null;
        setupEmojiBlocker();
        emojiBlockerActive = true;
      });
    }
  } else {
    cancelPendingEmojiBlocker?.();
    cancelPendingEmojiBlocker = null;
    if (emojiBlockerActive) {
      teardownEmojiBlocker();
      emojiBlockerActive = false;
    }
  }

  updateEmojiStyleElement(emojiBlocked ? generateEmojiStyles() : '');
}


function updateStyleElement(css: string): void {
  if (!css) {
    styleElement?.remove();
    styleElement = null;
    return;
  }

  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = 'cognitive-comfort-styles';
    (document.head || document.documentElement).appendChild(styleElement);
  }

  styleElement.textContent = css;
}

function updateEmojiStyleElement(css: string): void {
  if (!css) {
    emojiStyleElement?.remove();
    emojiStyleElement = null;
    return;
  }

  if (!emojiStyleElement) {
    emojiStyleElement = document.createElement('style');
    emojiStyleElement.id = 'cognitive-comfort-emoji-styles';
    (document.head || document.documentElement).appendChild(emojiStyleElement);
  }

  emojiStyleElement.textContent = css;
}
