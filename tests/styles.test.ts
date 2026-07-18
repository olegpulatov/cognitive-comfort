import { describe, it, expect } from 'vitest';
import type { ComfortSettings } from '../src/utils/types';
import { generateStyles, generateEmojiStyles } from '../src/entrypoints/comfort.content/styles';

const baseSettings: ComfortSettings = {
  schemaVersion: 1,
  enabled: true,
  paused: false,
  blockEmojis: false,
  blurScope: 'content',
  revealMode: 'click',
  blurAmount: 40,
  siteOverrides: {},
  emojiSiteOverrides: {},
};

describe('generateStyles', () => {
  it.each([10, 90])(
    'base rule applies blur(%ipx) and brightness(0.3) for blurAmount %i',
    (amount) => {
      const css = generateStyles({ ...baseSettings, blurAmount: amount });
      expect(css).toContain(`blur(${amount}px)`);
      expect(css).toContain('brightness(0.3)');
    }
  );

  it('reveal rule targets the revealed attribute with brightness(1)', () => {
    const css = generateStyles(baseSettings);
    expect(css).toContain('[data-comfort-revealed="true"]');
    expect(css).toContain('brightness(1)');
  });

  it('peek rule targets the peek attribute', () => {
    const css = generateStyles(baseSettings);
    expect(css).toContain('[data-comfort-peek]');
  });

  it("content scope blurs content media (img, bg-image) but not bare svg", () => {
    const css = generateStyles({ ...baseSettings, blurScope: 'content' });
    expect(css).toContain('img:not');
    expect(css).toContain('[data-comfort-bg-image]');
    expect(css).not.toContain('svg');
  });

  it("all scope additionally blurs svg (small UI media)", () => {
    const css = generateStyles({ ...baseSettings, blurScope: 'all' });
    expect(css).toContain('svg');
    expect(css).toContain('img:not');
  });
});

describe('generateEmojiStyles', () => {
  it('hides .comfort-emoji by default and reveals it on peek', () => {
    const css = generateEmojiStyles();
    expect(css).toContain('.comfort-emoji {');
    expect(css).toContain('display: none');
    expect(css).toContain(':root[data-comfort-peek] .comfort-emoji');
    expect(css).toContain('display: inline');
  });

  it('uses the :root prefix, not the invalid ::root pseudo-element', () => {
    const css = generateEmojiStyles();
    expect(css).not.toContain('::root');
  });
});
