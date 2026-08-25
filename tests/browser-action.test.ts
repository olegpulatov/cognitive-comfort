import { describe, expect, it } from 'vitest';
import { getBrowserActionPresentation } from '../src/utils/browser-action';
import type { ComfortSettings } from '../src/utils/types';

const settings: ComfortSettings = {
  schemaVersion: 1,
  enabled: true,
  paused: false,
  blockEmojis: false,
  blurScope: 'all',
  revealMode: 'both',
  blurAmount: 50,
  siteOverrides: {},
  emojiSiteOverrides: {},
};

describe('browser action presentation', () => {
  it('reports active media for a domain', () => {
    expect(getBrowserActionPresentation(settings, 'example.com')).toEqual({
      title: 'Cognitive Comfort — Media blurred on example.com',
    });
  });

  it('reports paused state ahead of domain and global state', () => {
    expect(getBrowserActionPresentation({ ...settings, paused: true }, 'example.com')).toEqual({
      title: 'Cognitive Comfort — Paused',
    });
  });

  it('reports global show state without a readable domain', () => {
    expect(getBrowserActionPresentation({ ...settings, enabled: false }, '')).toEqual({
      title: 'Cognitive Comfort — Media shown globally',
    });
  });

  it('reports exact and inherited site-show overrides', () => {
    const overridden = {
      ...settings,
      siteOverrides: { 'example.com': 'disabled' as const },
    };
    expect(getBrowserActionPresentation(overridden, 'example.com').title)
      .toBe('Cognitive Comfort — Media shown on example.com');
    expect(getBrowserActionPresentation(overridden, 'news.example.com').title)
      .toBe('Cognitive Comfort — Media shown on news.example.com');
  });
});
