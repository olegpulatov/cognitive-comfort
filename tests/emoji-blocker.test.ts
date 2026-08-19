// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupEmojiBlocker, teardownEmojiBlocker } from '../src/entrypoints/comfort.content/emoji-blocker';

describe('emoji blocker', () => {
  beforeEach(() => {
    teardownEmojiBlocker();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    teardownEmojiBlocker();
    vi.restoreAllMocks();
  });

  it('wraps emoji text while skipping editable, form, and script content', () => {
    document.body.innerHTML = `
      <p id="normal">Focus 🧠 now</p>
      <div contenteditable="true">Editable 🧠</div>
      <textarea>Form 🧠</textarea>
      <input value="Input 🧠">
      <script>window.label = 'Script 🧠'</script>
    `;

    setupEmojiBlocker();

    expect(document.querySelector('#normal .comfort-emoji')?.textContent).toBe('🧠');
    expect(document.querySelector('[contenteditable] .comfort-emoji')).toBeNull();
    expect(document.querySelector('textarea .comfort-emoji')).toBeNull();
    expect(document.querySelector('script .comfort-emoji')).toBeNull();
  });

  it('processes dynamically added text nodes', async () => {
    setupEmojiBlocker();
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Dynamic 🎯';
    document.body.append(paragraph);

    await vi.waitFor(() => {
      expect(paragraph.querySelector('.comfort-emoji')?.textContent).toBe('🎯');
    });
  });

  it('is idempotent and teardown restores visible text', () => {
    document.body.innerHTML = '<p id="message">Keep 🌿 visible</p>';

    setupEmojiBlocker();
    setupEmojiBlocker();
    expect(document.querySelectorAll('.comfort-emoji')).toHaveLength(1);

    teardownEmojiBlocker();
    expect(document.querySelectorAll('.comfort-emoji')).toHaveLength(0);
    expect(document.querySelector('#message')?.textContent).toBe('Keep 🌿 visible');

    document.body.append(' Later 🧩');
    expect(document.querySelectorAll('.comfort-emoji')).toHaveLength(0);
  });

  it('processes in-place textContent changes (characterData mutations)', async () => {
    document.body.innerHTML = '<p id="ticker">Price: $100</p>';
    setupEmojiBlocker();

    expect(document.querySelectorAll('.comfort-emoji')).toHaveLength(0);

    const ticker = document.querySelector('#ticker') as HTMLParagraphElement;
    const textNode = ticker.firstChild as Text;
    textNode.textContent = 'Price: $105 🚀';

    await vi.waitFor(() => {
      expect(ticker.querySelector('.comfort-emoji')?.textContent).toBe('🚀');
    });
  });
});
