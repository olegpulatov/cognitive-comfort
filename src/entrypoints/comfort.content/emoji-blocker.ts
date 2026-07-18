import { isEditableElement } from './editable';

const EMOJI_REGEX = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu;
const SKIPPED_TEXT_PARENT_SELECTOR = 'script, style, noscript, textarea, input, select, option';

let observer: MutationObserver | null = null;
let isActive = false;

function processTextNode(node: Text): void {
  const parent = node.parentElement;
  if (!parent || shouldSkipTextParent(parent)) return;

  const text = node.textContent;
  if (!text || !EMOJI_REGEX.test(text)) return;

  EMOJI_REGEX.lastIndex = 0;

  const parts: (string | { emoji: string })[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = EMOJI_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push({ emoji: match[0] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  if (parts.every((part) => typeof part === 'string')) return;

  const fragment = document.createDocumentFragment();
  for (const part of parts) {
    if (typeof part === 'string') {
      fragment.appendChild(document.createTextNode(part));
    } else {
      const span = document.createElement('span');
      span.className = 'comfort-emoji';
      span.textContent = part.emoji;
      fragment.appendChild(span);
    }
  }

  node.parentNode?.replaceChild(fragment, node);
}

function processElement(root: Node): void {
  if (root instanceof Text) {
    processTextNode(root);
    return;
  }

  if (root instanceof Element && shouldSkipTextParent(root)) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      return parent && !shouldSkipTextParent(parent)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    textNodes.push(node as Text);
  }

  for (const textNode of textNodes) {
    processTextNode(textNode);
  }
}

function handleMutations(mutations: MutationRecord[]): void {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        processTextNode(node as Text);
        continue;
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        if (!shouldSkipTextParent(element)) {
          processElement(node);
        }
      }
    }
  }
}

function shouldSkipTextParent(element: Element): boolean {
  if (element.classList.contains('comfort-emoji')) return true;
  if (element.closest(SKIPPED_TEXT_PARENT_SELECTOR)) return true;
  return isEditableElement(element);
}

export function setupEmojiBlocker(): void {
  if (isActive) return;
  isActive = true;

  processElement(document.body || document.documentElement);

  observer = new MutationObserver(handleMutations);
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });
}

export function teardownEmojiBlocker(): void {
  if (!isActive) return;
  isActive = false;

  if (observer) {
    observer.disconnect();
    observer = null;
  }

  const emojiSpans = document.querySelectorAll('.comfort-emoji');
  for (const span of emojiSpans) {
    const text = span.textContent;
    if (text && span.parentNode) {
      span.parentNode.replaceChild(document.createTextNode(text), span);
    }
  }
}
