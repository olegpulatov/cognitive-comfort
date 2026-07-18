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
  blurScope: 'content',
  revealMode: 'click',
  blurAmount: 40,
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
      expect((await getSettings()).blurAmount).toBe(40);
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

    it("falls back to 'content' for an invalid blurScope", async () => {
      await seed({ blurScope: 'bogus' });
      expect((await getSettings()).blurScope).toBe('content');
    });

    it("falls back to 'click' for an invalid revealMode", async () => {
      await seed({ revealMode: 'nope' });
      expect((await getSettings()).revealMode).toBe('click');
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
      expect(settings.blurAmount).toBe(40);
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
  });

  describe('toggles', () => {
    it('togglePause flips paused and returns the new boolean across two calls', async () => {
      expect(await togglePause()).toBe(true);
      expect(await togglePause()).toBe(false);
      expect((await getSettings()).paused).toBe(false);
    });

    it('toggleGlobalMedia returns the inverse of the current enabled state', async () => {
      await setGlobalMediaEnabled(false);
      expect(await toggleGlobalMedia()).toBe(true);
      expect((await getSettings()).enabled).toBe(true);
    });

    it("toggleSiteOverride toggles to 'disabled' then back to 'default' when globally enabled", async () => {
      expect(await toggleSiteOverride('x.com')).toBe('disabled');
      expect(await toggleSiteOverride('x.com')).toBe('default');
      expect((await getSettings()).siteOverrides).toEqual({});
    });
  });

  describe('site overrides', () => {
    it("setSiteOverride stores a disabled override, and 'default' removes the key", async () => {
      await setSiteOverride('x.com', 'disabled');
      expect((await getSettings()).siteOverrides).toEqual({ 'x.com': 'disabled' });
      await setSiteOverride('x.com', 'default');
      expect((await getSettings()).siteOverrides).toEqual({});
    });

    it("setEmojiSiteOverride stores an override, and 'default' removes the key", async () => {
      await setEmojiSiteOverride('x.com', 'enabled');
      expect((await getSettings()).emojiSiteOverrides).toEqual({ 'x.com': 'enabled' });
      await setEmojiSiteOverride('x.com', 'default');
      expect((await getSettings()).emojiSiteOverrides).toEqual({});
    });

    it('preserves two concurrent media overrides for different domains', async () => {
      await Promise.all([
        setSiteOverride('first.example', 'disabled'),
        setSiteOverride('second.example', 'enabled'),
      ]);

      expect((await getSettings()).siteOverrides).toEqual({
        'first.example': 'disabled',
        'second.example': 'enabled',
      });
    });

    it('preserves two concurrent emoji overrides for different domains', async () => {
      await Promise.all([
        setEmojiSiteOverride('first.example', 'enabled'),
        setEmojiSiteOverride('second.example', 'disabled'),
      ]);

      expect((await getSettings()).emojiSiteOverrides).toEqual({
        'first.example': 'enabled',
        'second.example': 'disabled',
      });
    });

    it('serializes direct background override updates', async () => {
      await Promise.all([
        applySiteOverrideUpdate('siteOverrides', 'first.example', 'disabled'),
        applySiteOverrideUpdate('siteOverrides', 'second.example', 'enabled'),
      ]);

      expect((await getSettings()).siteOverrides).toEqual({
        'first.example': 'disabled',
        'second.example': 'enabled',
      });
    });
  });

  describe('site override messages', () => {
    it('accepts only strict site override update messages', () => {
      expect(isSiteOverrideUpdateMessage({
        type: COMFORT_SITE_OVERRIDE_UPDATE_MESSAGE,
        key: 'siteOverrides',
        domain: 'example.com',
        override: 'disabled',
      })).toBe(true);
      expect(isSiteOverrideUpdateMessage({
        type: COMFORT_SITE_OVERRIDE_UPDATE_MESSAGE,
        key: 'unexpected',
        domain: 'example.com',
        override: 'disabled',
      })).toBe(false);
      expect(isSiteOverrideUpdateMessage({
        type: COMFORT_SITE_OVERRIDE_UPDATE_MESSAGE,
        key: 'siteOverrides',
        domain: '',
        override: 'disabled',
      })).toBe(false);
      expect(isSiteOverrideUpdateMessage({
        type: COMFORT_SITE_OVERRIDE_UPDATE_MESSAGE,
        key: 'siteOverrides',
        domain: 'example.com',
        override: 'unexpected',
      })).toBe(false);
    });

    it('surfaces explicit background failure without poisoning a later local write', async () => {
      vi.stubGlobal('window', {});
      const sendMessage = vi.spyOn(browser.runtime, 'sendMessage')
        .mockResolvedValueOnce({ ok: false } as never)
        .mockRejectedValueOnce(new Error('No receiving end'));

      await expect(setSiteOverride('failed.example', 'disabled')).rejects.toThrow(
        'Cognitive Comfort failed to persist settings.',
      );
      await expect(setSiteOverride('later.example', 'enabled')).resolves.toBeUndefined();
      expect((await getSettings()).siteOverrides).toEqual({ 'later.example': 'enabled' });

      expect(sendMessage).toHaveBeenCalledTimes(2);
      vi.unstubAllGlobals();
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
      expect(settings.blurAmount).toBe(40);
    });
  });

  describe('onSettingsChange', () => {
    it('fires the callback once with the persisted settings on save', async () => {
      const cb = vi.fn();
      onSettingsChange(cb);
      await saveSettings({ paused: true });

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb.mock.calls[0][0]).toMatchObject({ paused: true });
    });
  });
  describe('isSettingsUpdateMessage', () => {
    it('rejects null settings (typeof null === object must not slip through)', () => {
      // Regression: `typeof null === 'object'` previously let a null payload
      // through the type guard; the explicit null check must now reject it.
      expect(
        isSettingsUpdateMessage({ type: COMFORT_SETTINGS_UPDATE_MESSAGE, settings: null })
      ).toBe(false);
    });

    it('accepts a valid settings object', () => {
      expect(
        isSettingsUpdateMessage({
          type: COMFORT_SETTINGS_UPDATE_MESSAGE,
          settings: { paused: true },
        })
      ).toBe(true);
    });

    it('rejects when the settings key is absent', () => {
      expect(isSettingsUpdateMessage({ type: COMFORT_SETTINGS_UPDATE_MESSAGE })).toBe(false);
    });

    it('rejects an unknown message type', () => {
      expect(isSettingsUpdateMessage({ type: 'other', settings: {} })).toBe(false);
    });

    it('rejects non-object payloads', () => {
      expect(isSettingsUpdateMessage('not-an-object')).toBe(false);
      expect(isSettingsUpdateMessage(null)).toBe(false);
      expect(isSettingsUpdateMessage(undefined)).toBe(false);
    });

    it('narrows settings for a passing message so they are readable', () => {
      const msg = {
        type: COMFORT_SETTINGS_UPDATE_MESSAGE,
        settings: { paused: true },
      };
      if (isSettingsUpdateMessage(msg)) {
        // `msg.settings` is narrowed to Partial<ComfortSettings> here, so the
        // `.paused` read type-checks and exercises the type guard.
        expect(msg.settings.paused).toBe(true);
      } else {
        expect.unreachable('type guard should have accepted the message');
      }
    });
  });

  describe('onSettingsChange — normalization (regression)', () => {
    it('normalizes a corrupt newValue before handing it to the callback', async () => {
      const cb = vi.fn();
      onSettingsChange(cb);
      // Seed corrupt data directly: a string `paused` and an out-of-range
      // blur amount. The listener must hand consumers a normalized object,
      // not the raw/unvalidated payload.
      await browser.storage.local.set({
        comfortSettings: { paused: 'false', blurAmount: 9999 },
      });

      expect(cb).toHaveBeenCalled();
      const received = cb.mock.calls.at(-1)![0] as ComfortSettings;
      expect(received.paused).toBe(false); // boolean, not the string 'false'
      expect(received.blurAmount).toBe(100); // clamped to BLUR_AMOUNT_MAX
      expect(received.schemaVersion).toBe(1);
    });

    it('rebuilds full defaults when the stored value is undefined (deletion)', async () => {
      // The mock emits { newValue: undefined } when the value is undefined
      // (see tests/setup.ts: Object.entries keeps the key, stores undefined,
      // and emitChange forwards it). The listener must rebuild full defaults.
      const cb = vi.fn();
      onSettingsChange(cb);
      await browser.storage.local.set({ comfortSettings: undefined });

      expect(cb).toHaveBeenCalled();
      const received = cb.mock.calls.at(-1)![0] as ComfortSettings;
      expect(received.enabled).toBe(true);
      expect(received.schemaVersion).toBe(1);
      expect(received.blurAmount).toBe(40);
    });
  });

  describe('writeQueue — recovery after a failing write (regression)', () => {
    it('rejects the failing call but does not poison subsequent writes', async () => {
      // The fix decouples the queue chain so one rejected write cannot reject
      // every later save. Make `.set` throw exactly once, then restore it.
      const originalSet = browser.storage.local.set;
      try {
        let calls = 0;
        browser.storage.local.set = async (items: Record<string, unknown>) => {
          calls += 1;
          if (calls === 1) throw new Error('boom');
          return originalSet(items);
        };

        // First (failing) write surfaces its own error to the caller.
        await expect(saveSettings({ paused: true })).rejects.toThrow('boom');

        // The queue is NOT poisoned: an immediately following write must
        // resolve (not hang/reject) and persist normally.
        await saveSettings({ paused: true });
        expect((await getSettings()).paused).toBe(true);
      } finally {
        browser.storage.local.set = originalSet;
      }
    });
  });
});
