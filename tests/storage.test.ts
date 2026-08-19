import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComfortSettings } from '../src/utils/types';
import {
  COMFORT_SETTINGS_KEY,
  COMFORT_SETTINGS_UPDATE_MESSAGE,
  COMFORT_SITE_OVERRIDE_UPDATE_MESSAGE,
  SCHEMA_VERSION,
  applySiteOverrideUpdate,
  getSettings,
  saveSettings,
  togglePause,
  setGlobalMediaEnabled,
  toggleGlobalMedia,
  setSiteOverride,
  setEmojiSiteOverride,
  toggleSiteOverride,
  isActiveForSite,
  isEmojiBlockedForSite,
  isSettingsUpdateMessage,
  isSiteOverrideUpdateMessage,
  onSettingsChange,
} from '../src/utils/storage';

// `browser` is the wxt auto-import global; tests/setup.ts replaces it with an
// in-memory storage mock before any test module loads.

const EXPECTED_DEFAULTS: ComfortSettings = {
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

function mkSettings(overrides: Partial<ComfortSettings> = {}): ComfortSettings {
  return { ...EXPECTED_DEFAULTS, ...overrides };
}

async function seed(payload: Record<string, unknown>): Promise<void> {
  await browser.storage.local.set({ [COMFORT_SETTINGS_KEY]: payload });
}

describe('storage', () => {
  beforeEach(() => {
    browser.storage.local.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('constants', () => {
    it('exports the expected storage key and schema version', () => {
      expect(COMFORT_SETTINGS_KEY).toBe('comfortSettings');
      expect(SCHEMA_VERSION).toBe(1);
    });
  });

  describe('getSettings — defaults', () => {
    it('returns full defaults on an empty store, with schemaVersion 1', async () => {
      const settings = await getSettings();
      expect(settings).toEqual(EXPECTED_DEFAULTS);
      expect(settings.schemaVersion).toBe(1);
    });
  });

  describe('getSettings — validation/coercion', () => {
    it("coerces a string 'false' for enabled back to the boolean default true (not truthy)", async () => {
      await seed({ enabled: 'false' });
      const settings = await getSettings();
      expect(settings.enabled).toBe(true);
      expect(typeof settings.enabled).toBe('boolean');
    });

    it("coerces a string 'false' for paused back to the boolean default false", async () => {
      await seed({ paused: 'false' });
      const settings = await getSettings();
      expect(settings.paused).toBe(false);
      expect(typeof settings.paused).toBe('boolean');
    });

    it("coerces a string 'false' for blockEmojis back to the boolean default false", async () => {
      await seed({ blockEmojis: 'false' });
      const settings = await getSettings();
      expect(settings.blockEmojis).toBe(false);
      expect(typeof settings.blockEmojis).toBe('boolean');
    });

    it('falls back to the default blurAmount for a non-numeric string', async () => {
      await seed({ blurAmount: 'abc' });
      expect((await getSettings()).blurAmount).toBe(50);
    });

    it('clamps an oversized blurAmount to the maximum (100)', async () => {
      await seed({ blurAmount: 9999 });
      expect((await getSettings()).blurAmount).toBe(100);
    });

    it('clamps a sub-minimum blurAmount up to the minimum (1)', async () => {
      await seed({ blurAmount: 0 });
      expect((await getSettings()).blurAmount).toBe(1);
    });

    it('rounds a fractional blurAmount to the nearest integer', async () => {
      await seed({ blurAmount: 33.7 });
      expect((await getSettings()).blurAmount).toBe(34);
    });

    it("falls back to default blurScope for an invalid blurScope", async () => {
      await seed({ blurScope: 'bogus' });
      expect((await getSettings()).blurScope).toBe('all');
    });

    it("falls back to default revealMode for an invalid revealMode", async () => {
      await seed({ revealMode: 'nope' });
      expect((await getSettings()).revealMode).toBe('both');
    });

    it('drops invalid siteOverrides entries, keeping only valid ones', async () => {
      await seed({
        siteOverrides: { 'x.com': 'enabled', 'y.com': 'banana', 'z.com': 123 },
      });
      expect((await getSettings()).siteOverrides).toEqual({ 'x.com': 'enabled' });
    });

    it('merges a partial valid payload with the defaults', async () => {
      await seed({ paused: true });
      const settings = await getSettings();
      expect(settings.paused).toBe(true);
      expect(settings.enabled).toBe(true);
      expect(settings.blurAmount).toBe(50);
      expect(settings.siteOverrides).toEqual({});
    });
  });

  describe('saveSettings', () => {
    it('persists settings written via saveSettings and reads them back', async () => {
      await saveSettings({ paused: true });
      expect((await getSettings()).paused).toBe(true);
    });

    it('persists enabled:false written via saveSettings and reads it back', async () => {
      await saveSettings({ enabled: false });
      expect((await getSettings()).enabled).toBe(false);
    });

    it('persists blurAmount written via saveSettings and clamps appropriately', async () => {
      await saveSettings({ blurAmount: 12 });
      expect((await getSettings()).blurAmount).toBe(12);
    });
  });

  describe('toggles', () => {
    it('togglePause flips paused from false to true and returns the new value', async () => {
      const result = await togglePause();
      expect(result).toBe(true);
      expect((await getSettings()).paused).toBe(true);
    });

    it('togglePause flips paused from true to false', async () => {
      await seed({ paused: true });
      const result = await togglePause();
      expect(result).toBe(false);
      expect((await getSettings()).paused).toBe(false);
    });

    it('setGlobalMediaEnabled writes the boolean flag', async () => {
      await setGlobalMediaEnabled(false);
      expect((await getSettings()).enabled).toBe(false);
    });

    it('toggleGlobalMedia flips the enabled flag', async () => {
      const result = await toggleGlobalMedia();
      expect(result).toBe(false);
      expect((await getSettings()).enabled).toBe(false);
    });
  });

  describe('site overrides', () => {
    it("setSiteOverride sets an override for a domain", async () => {
      await setSiteOverride('example.com', 'enabled');
      expect((await getSettings()).siteOverrides['example.com']).toBe('enabled');
    });

    it("setSiteOverride removes the key when setting to 'default'", async () => {
      await seed({ siteOverrides: { 'example.com': 'enabled' } });
      await setSiteOverride('example.com', 'default');
      expect('example.com' in (await getSettings()).siteOverrides).toBe(false);
    });

    it("setEmojiSiteOverride sets an emoji override for a domain", async () => {
      await setEmojiSiteOverride('example.com', 'disabled');
      expect((await getSettings()).emojiSiteOverrides['example.com']).toBe('disabled');
    });

    it("setEmojiSiteOverride removes the key when setting to 'default'", async () => {
      await seed({ emojiSiteOverrides: { 'example.com': 'disabled' } });
      await setEmojiSiteOverride('example.com', 'default');
      expect('example.com' in (await getSettings()).emojiSiteOverrides).toBe(false);
    });

    it("toggleSiteOverride cycles default -> disabled (when globally enabled)", async () => {
      const next = await toggleSiteOverride('example.com');
      expect(next).toBe('disabled');
      expect((await getSettings()).siteOverrides['example.com']).toBe('disabled');
    });

    it("toggleSiteOverride cycles disabled -> default (when globally enabled)", async () => {
      await seed({ siteOverrides: { 'example.com': 'disabled' } });
      const next = await toggleSiteOverride('example.com');
      expect(next).toBe('default');
      expect('example.com' in (await getSettings()).siteOverrides).toBe(false);
    });

    it("toggleSiteOverride cycles default -> enabled (when globally disabled)", async () => {
      await seed({ enabled: false });
      const next = await toggleSiteOverride('example.com');
      expect(next).toBe('enabled');
      expect((await getSettings()).siteOverrides['example.com']).toBe('enabled');
    });

    it("toggleSiteOverride cycles enabled -> default (when globally disabled)", async () => {
      await seed({ enabled: false, siteOverrides: { 'example.com': 'enabled' } });
      const next = await toggleSiteOverride('example.com');
      expect(next).toBe('default');
      expect('example.com' in (await getSettings()).siteOverrides).toBe(false);
    });

    it('preserves concurrent fixed overrides for different domains', async () => {
      await Promise.all([
        setSiteOverride('alpha.com', 'disabled'),
        setSiteOverride('beta.com', 'enabled'),
      ]);
      expect((await getSettings()).siteOverrides).toEqual({
        'alpha.com': 'disabled',
        'beta.com': 'enabled',
      });
    });

    it("serializes concurrent toggleSiteOverride calls without losing toggles", async () => {
      const [res1, res2] = await Promise.all([
        toggleSiteOverride('concurrent.com'),
        toggleSiteOverride('concurrent.com'),
      ]);
      expect([res1, res2]).toEqual(['disabled', 'default']);
      expect('concurrent.com' in (await getSettings()).siteOverrides).toBe(false);
    });

    it("routes toggleSiteOverride through the background and applies the returned next value", async () => {
      vi.stubGlobal('window', {});
      const sendMessage = vi.spyOn(browser.runtime, 'sendMessage')
        .mockResolvedValue({ ok: true, next: 'disabled' } as never);

      const result = await toggleSiteOverride('route.com');
      expect(result).toBe('disabled');
      expect(sendMessage).toHaveBeenCalledWith({
        type: COMFORT_SITE_OVERRIDE_UPDATE_MESSAGE,
        key: 'siteOverrides',
        domain: 'route.com',
        override: 'toggle',
      });
      // Background applies the toggle; the caller trusts the response, no local write.
      expect((await getSettings()).siteOverrides['route.com']).toBeUndefined();
    });

    it('surfaces an explicit background failure instead of claiming the toggle succeeded', async () => {
      vi.stubGlobal('window', {});
      vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue({ ok: false } as never);

      await expect(toggleSiteOverride('failed.com')).rejects.toThrow(
        'Cognitive Comfort failed to persist settings.'
      );
      expect((await getSettings()).siteOverrides['failed.com']).toBeUndefined();
    });

    it('falls back to the queued local toggle when the background response is malformed', async () => {
      vi.stubGlobal('window', {});
      vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue({ ok: true } as never);

      await expect(toggleSiteOverride('fallback.com')).resolves.toBe('disabled');
      expect((await getSettings()).siteOverrides['fallback.com']).toBe('disabled');
    });
  });

  describe('site override messages', () => {
    it('applies an override via applySiteOverrideUpdate', async () => {
      await applySiteOverrideUpdate('siteOverrides', 'example.com', 'enabled');
      expect((await getSettings()).siteOverrides['example.com']).toBe('enabled');
    });

    it('removes an override via applySiteOverrideUpdate when override is default', async () => {
      await seed({ siteOverrides: { 'example.com': 'enabled' } });
      await applySiteOverrideUpdate('siteOverrides', 'example.com', 'default');
      expect('example.com' in (await getSettings()).siteOverrides).toBe(false);
    });

    it('rejects a malformed site override message (not an object)', () => {
      expect(isSiteOverrideUpdateMessage(null)).toBe(false);
      expect(isSiteOverrideUpdateMessage('string')).toBe(false);
    });

    it('rejects a site override message with wrong type constant', () => {
      expect(
        isSiteOverrideUpdateMessage({
          type: 'some-other-type',
          key: 'siteOverrides',
          domain: 'example.com',
          override: 'enabled',
        })
      ).toBe(false);
    });

    it('rejects a site override message with invalid override value', () => {
      expect(
        isSiteOverrideUpdateMessage({
          type: COMFORT_SITE_OVERRIDE_UPDATE_MESSAGE,
          key: 'siteOverrides',
          domain: 'example.com',
          override: 'invalid',
        })
      ).toBe(false);
    });

    it('accepts a well-formed site override update message', () => {
      expect(
        isSiteOverrideUpdateMessage({
          type: COMFORT_SITE_OVERRIDE_UPDATE_MESSAGE,
          key: 'siteOverrides',
          domain: 'example.com',
          override: 'enabled',
        })
      ).toBe(true);
    });

    it('accepts a media toggle message but rejects an emoji-scoped toggle (regression)', () => {
      expect(
        isSiteOverrideUpdateMessage({
          type: COMFORT_SITE_OVERRIDE_UPDATE_MESSAGE,
          key: 'siteOverrides',
          domain: 'example.com',
          override: 'toggle',
        })
      ).toBe(true);
      expect(
        isSiteOverrideUpdateMessage({
          type: COMFORT_SITE_OVERRIDE_UPDATE_MESSAGE,
          key: 'emojiSiteOverrides',
          domain: 'example.com',
          override: 'toggle',
        })
      ).toBe(false);
    });
  });

  describe('isActiveForSite', () => {
    it('returns false when paused, regardless of enabled or site overrides', () => {
      const settings = mkSettings({
        paused: true,
        enabled: true,
        siteOverrides: { 'x.com': 'enabled' },
      });
      expect(isActiveForSite(settings, 'x.com')).toBe(false);
    });

    it("returns false for a 'disabled' site override", () => {
      const settings = mkSettings({ siteOverrides: { 'x.com': 'disabled' } });
      expect(isActiveForSite(settings, 'x.com')).toBe(false);
    });

    it("returns true for an 'enabled' site override even when globally disabled", () => {
      const settings = mkSettings({ enabled: false, siteOverrides: { 'x.com': 'enabled' } });
      expect(isActiveForSite(settings, 'x.com')).toBe(true);
    });

    it("falls back to the global enabled flag when the override is 'default'", () => {
      expect(isActiveForSite(mkSettings({ enabled: true }), 'x.com')).toBe(true);
      expect(isActiveForSite(mkSettings({ enabled: false }), 'x.com')).toBe(false);
    });
  });

  describe('isEmojiBlockedForSite', () => {
    it('returns false when paused, regardless of blockEmojis', () => {
      const settings = mkSettings({ paused: true, blockEmojis: true });
      expect(isEmojiBlockedForSite(settings, 'x.com')).toBe(false);
    });

    it('honors enabled/disabled overrides, then falls back to blockEmojis', () => {
      expect(
        isEmojiBlockedForSite(mkSettings({ emojiSiteOverrides: { 'x.com': 'enabled' } }), 'x.com')
      ).toBe(true);
      expect(
        isEmojiBlockedForSite(
          mkSettings({ blockEmojis: true, emojiSiteOverrides: { 'x.com': 'disabled' } }),
          'x.com'
        )
      ).toBe(false);
      expect(isEmojiBlockedForSite(mkSettings({ blockEmojis: true }), 'x.com')).toBe(true);
      expect(isEmojiBlockedForSite(mkSettings({ blockEmojis: false }), 'x.com')).toBe(false);
    });
  });

  describe('migration', () => {
    it('upgrades a legacy schemaVersion stamp without dropping valid data', async () => {
      await seed({ schemaVersion: 0, enabled: false });
      const settings = await getSettings();
      expect(settings.schemaVersion).toBe(1);
      expect(settings.enabled).toBe(false);
      expect(settings.blurAmount).toBe(50);
    });
  });

  describe('onSettingsChange', () => {
    it('fires callback with new settings when storage changes', async () => {
      const cb = vi.fn();
      onSettingsChange(cb);
      await saveSettings({ paused: true });
      expect(cb).toHaveBeenCalled();
    });
  });

  describe('isSettingsUpdateMessage', () => {
    it('rejects primitives and null', () => {
      expect(isSettingsUpdateMessage(null)).toBe(false);
      expect(isSettingsUpdateMessage(undefined)).toBe(false);
      expect(isSettingsUpdateMessage('hello')).toBe(false);
      expect(isSettingsUpdateMessage(42)).toBe(false);
      expect(isSettingsUpdateMessage(true)).toBe(false);
    });

    it('rejects objects with the wrong type constant', () => {
      expect(
        isSettingsUpdateMessage({
          type: 'some-other-type',
          settings: { enabled: true },
        })
      ).toBe(false);
    });

    it('rejects messages where settings is not a non-null object', () => {
      expect(
        isSettingsUpdateMessage({
          type: COMFORT_SETTINGS_UPDATE_MESSAGE,
          settings: null,
        })
      ).toBe(false);
      expect(
        isSettingsUpdateMessage({
          type: COMFORT_SETTINGS_UPDATE_MESSAGE,
          settings: 'not-an-object',
        })
      ).toBe(false);
    });

    it('accepts a well-formed update message with partial settings', () => {
      const msg = {
        type: COMFORT_SETTINGS_UPDATE_MESSAGE,
        settings: { enabled: false, blurAmount: 60 },
      };
      expect(isSettingsUpdateMessage(msg)).toBe(true);
    });

    it('narrows settings for a passing message so they are readable', () => {
      const msg: unknown = {
        type: COMFORT_SETTINGS_UPDATE_MESSAGE,
        settings: { enabled: false },
      };
      if (isSettingsUpdateMessage(msg)) {
        expect(msg.settings.enabled).toBe(false);
      } else {
        expect.unreachable('type guard should have accepted the message');
      }
    });
  });

  describe('onSettingsChange — normalization (regression)', () => {
    it('normalizes a corrupt newValue before handing it to the callback', async () => {
      const cb = vi.fn();
      onSettingsChange(cb);
      await browser.storage.local.set({
        comfortSettings: { paused: 'false', blurAmount: 9999 },
      });

      expect(cb).toHaveBeenCalled();
      const received = cb.mock.calls.at(-1)![0] as ComfortSettings;
      expect(received.paused).toBe(false);
      expect(received.blurAmount).toBe(100);
      expect(received.schemaVersion).toBe(1);
    });

    it('rebuilds full defaults when the stored value is undefined (deletion)', async () => {
      const cb = vi.fn();
      onSettingsChange(cb);
      await browser.storage.local.set({ comfortSettings: undefined });

      expect(cb).toHaveBeenCalled();
      const received = cb.mock.calls.at(-1)![0] as ComfortSettings;
      expect(received.enabled).toBe(true);
      expect(received.schemaVersion).toBe(1);
      expect(received.blurAmount).toBe(50);
    });
  });

  describe('writeQueue — recovery after a failing write (regression)', () => {
    it('rejects the failing call but does not poison subsequent writes', async () => {
      const originalSet = browser.storage.local.set;
      try {
        let calls = 0;
        browser.storage.local.set = async (items: Record<string, unknown>) => {
          calls += 1;
          if (calls === 1) throw new Error('boom');
          return originalSet(items);
        };

        await expect(saveSettings({ paused: true })).rejects.toThrow('boom');

        await saveSettings({ paused: true });
        expect((await getSettings()).paused).toBe(true);
      } finally {
        browser.storage.local.set = originalSet;
      }
    });
  });
});
