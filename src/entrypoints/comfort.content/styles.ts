import type { ComfortSettings } from '../../utils/types';
import { BG_IMAGE_ATTR } from './bg-image-detector';

export const REVEALED_ATTR = 'data-comfort-revealed';
export const PEEK_CONTAINER_ATTR = 'data-comfort-peek-container';

export const CONTENT_MEDIA_SELECTOR_LIST = [
  'img:not([width="1"]):not([height="1"])',
  'picture',
  'video',
  'canvas',
  'iframe[src*="youtube"]',
  'iframe[src*="vimeo"]',
  'iframe[src*="twitch"]',
  'iframe[src*="dailymotion"]',
  'iframe[src*="streamable"]',
  'iframe[src*="kick.com"]',
  'iframe[src*="bilibili"]',
  `[${BG_IMAGE_ATTR}]`,
];

export const SMALL_UI_MEDIA_SELECTOR_LIST = [
  'svg',
  'button img',
  'button svg',
  'a img[alt*="logo" i]',
  'a svg',
  '[role="button"] img',
  '[role="button"] svg',
  '[aria-label] svg',
  '[aria-label] img',
];

export function generateStyles(settings: ComfortSettings): string {
  const selectors = getBlurSelectors(settings);
  const base = selectors
    .map((selector) => `${selector}:not([${REVEALED_ATTR}="true"])`)
    .join(', ');
  const revealedSelectors = selectors
    .map((selector) => `${selector}[${REVEALED_ATTR}="true"]`)
    .join(', ');

  const peekSelectors = CONTENT_MEDIA_SELECTOR_LIST.map(
    (selector) => `[data-comfort-peek] ${selector}`
  ).join(', ');

  return `${base} {
  filter: blur(${settings.blurAmount}px) brightness(0.3) !important;
  transition: filter 0.2s ease !important;
  cursor: pointer !important;
}
${revealedSelectors},
:root [${REVEALED_ATTR}="true"] {
  filter: blur(0px) brightness(1) !important;
}
${peekSelectors},
:root [${PEEK_CONTAINER_ATTR}] {
  filter: blur(0px) brightness(1) saturate(1) !important;
}
:root [${REVEALED_ATTR}="true"]::before,
:root [${PEEK_CONTAINER_ATTR}]::before {
  opacity: 0 !important;
  background: transparent !important;
}
`;
}

export function generateEmojiStyles(): string {
  return `
.comfort-emoji {
  display: none !important;
}
:root[data-comfort-peek] .comfort-emoji {
  display: inline !important;
}
`;
}

function getBlurSelectors(settings: ComfortSettings): string[] {
  if (settings.blurScope === 'all') {
    return [...CONTENT_MEDIA_SELECTOR_LIST, ...SMALL_UI_MEDIA_SELECTOR_LIST];
  }

  return CONTENT_MEDIA_SELECTOR_LIST;
}
