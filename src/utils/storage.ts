import type { BlurScope, ComfortSettings, RevealMode, SiteOverride } from './types';
import { getSiteOverride } from './domain';

export const COMFORT_SETTINGS_KEY = 'comfortSettings';
export const COMFORT_SETTINGS_UPDATE_MESSAGE = 'comfort-settings-update';
export const COMFORT_SITE_OVERRIDE_UPDATE_MESSAGE = 'comfort-site-override-update';
export const SCHEMA_VERSION = 1;

declare const __COMFORT_DEFAULTS__: ComfortSettings;

export const defaultSettings: ComfortSettings = __COMFORT_DEFAULTS__;

let writeQueue: Promise<void> = Promise.resolve();
type SiteOverrideKey = 'siteOverrides' | 'emojiSiteOverrides';
const PERSISTENCE_ERROR_MESSAGE = 'Cognitive Comfort failed to persist settings.';

const VALID_BLUR_SCOPES: readonly BlurScope[] = ['content', 'all'];
const VALID_REVEAL_MODES: readonly RevealMode[] = ['hover', 'click', 'both'];
const VALID_OVERRIDES: readonly SiteOverride[] = ['enabled', 'disabled', 'default'];
const BLUR_AMOUNT_MIN = 1;
const BLUR_AMOUNT_MAX = 100;

function isBlurScope(value: unknown): value is BlurScope {
  return (VALID_BLUR_SCOPES as readonly unknown[]).includes(value);
}

function isRevealMode(value: unknown): value is RevealMode {
  return (VALID_REVEAL_MODES as readonly unknown[]).includes(value);
}

function isOverride(value: unknown): value is SiteOverride {
  return (VALID_OVERRIDES as readonly unknown[]).includes(value);
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function coerceBlurAmount(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return defaultSettings.blurAmount;
  return Math.min(BLUR_AMOUNT_MAX, Math.max(BLUR_AMOUNT_MIN, Math.round(numeric)));
}

function coerceOverrides(value: unknown): Record<string, SiteOverride> {
  if (!value || typeof value !== 'object') return {};
  const result: Record<string, SiteOverride> = {};
  for (const [domain, raw] of Object.entries(value as Record<string, unknown>)) {
    if (isOverride(raw)) result[domain] = raw;
  }
  return result;
}

function normalizeSettings(source: unknown): ComfortSettings {
  const raw =
    source && typeof source === 'object' ? (source as Record<string, unknown>) : {};
  return {
    schemaVersion: SCHEMA_VERSION,
    enabled: coerceBoolean(raw.enabled, defaultSettings.enabled),
    paused: coerceBoolean(raw.paused, defaultSettings.paused),
    blockEmojis: coerceBoolean(raw.blockEmojis, defaultSettings.blockEmojis),
    blurScope: isBlurScope(raw.blurScope) ? raw.blurScope : defaultSettings.blurScope,
    revealMode: isRevealMode(raw.revealMode) ? raw.revealMode : defaultSettings.revealMode,
    blurAmount: coerceBlurAmount(raw.blurAmount),
    siteOverrides: coerceOverrides(raw.siteOverrides),
    emojiSiteOverrides: coerceOverrides(raw.emojiSiteOverrides),
  };
}

function migrate(stored: unknown): unknown {
  if (!stored || typeof stored !== 'object') return undefined;
  // Future migrations switch on the persisted schemaVersion to reshape legacy
  // data; normalizeSettings validates every field regardless.
  return stored;
}

export async function getSettings(): Promise<ComfortSettings> {
  const result = await browser.storage.local.get(COMFORT_SETTINGS_KEY);
  return normalizeSettings(migrate(result[COMFORT_SETTINGS_KEY]));
}

export async function saveSettings(settings: Partial<ComfortSettings>): Promise<void> {
  const sentToBackground = await trySaveViaBackground(settings);
  if (sentToBackground) return;
  await applySettingsUpdate(settings);
}

export async function applySettingsUpdate(settings: Partial<ComfortSettings>): Promise<void> {
  const run = writeQueue.then(async () => {
    const current = await getSettings();
    await browser.storage.local.set({
      [COMFORT_SETTINGS_KEY]: normalizeSettings({ ...current, ...settings }),
    });
  });
  // Keep the chain fulfilled even if this write rejects, so one failure can't
  // poison every later save. Surface this call's own error to the caller.
  writeQueue = run.catch(() => {});
  await run;
}

function isBackgroundContext(): boolean {
  return typeof window === 'undefined';
}

async function trySaveViaBackground(settings: Partial<ComfortSettings>): Promise<boolean> {
  if (isBackgroundContext()) return false;
  if (typeof browser?.runtime?.sendMessage !== 'function') return false;

  let response: unknown;
  try {
    response = await browser.runtime.sendMessage({
      type: COMFORT_SETTINGS_UPDATE_MESSAGE,
      settings,
    });
  } catch {
    return false;
  }

  if (typeof response === 'object' && response !== null && 'ok' in response) {
    if (response.ok === true) return true;
    if (response.ok === false) throw new Error(PERSISTENCE_ERROR_MESSAGE);
  }

  return false;
}

async function tryApplySiteOverrideViaBackground(
  key: SiteOverrideKey,
  domain: string,
  override: SiteOverride
): Promise<boolean> {
  if (isBackgroundContext()) return false;
  if (typeof browser?.runtime?.sendMessage !== 'function') return false;

  let response: unknown;
  try {
    response = await browser.runtime.sendMessage({
      type: COMFORT_SITE_OVERRIDE_UPDATE_MESSAGE,
      key,
      domain,
      override,
    });
  } catch {
    return false;
  }

  if (typeof response === 'object' && response !== null && 'ok' in response) {
    if (response.ok === true) return true;
    if (response.ok === false) throw new Error(PERSISTENCE_ERROR_MESSAGE);
  }

  return false;
}

export async function applySiteOverrideUpdate(
  key: SiteOverrideKey,
  domain: string,
  override: SiteOverride
): Promise<void> {
  const run = writeQueue.then(async () => {
    const current = await getSettings();
    const nextOverrides = { ...current[key] };

    if (override === 'default') {
      delete nextOverrides[domain];
    } else {
      nextOverrides[domain] = override;
    }

    await browser.storage.local.set({
      [COMFORT_SETTINGS_KEY]: normalizeSettings({ ...current, [key]: nextOverrides }),
    });
  });
  writeQueue = run.catch(() => {});
  await run;
}

type SiteOverrideUpdateMessage =
  | {
      type: typeof COMFORT_SITE_OVERRIDE_UPDATE_MESSAGE;
      key: SiteOverrideKey;
      domain: string;
      override: SiteOverride;
    }
  | {
      type: typeof COMFORT_SITE_OVERRIDE_UPDATE_MESSAGE;
      key: 'siteOverrides';
      domain: string;
      override: 'toggle';
    };

export function isSiteOverrideUpdateMessage(msg: unknown): msg is SiteOverrideUpdateMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const keys = Object.keys(msg);
  if (
    keys.length !== 4
    || !['type', 'key', 'domain', 'override'].every((key) => keys.includes(key))
  ) {
    return false;
  }
  if (!('type' in msg) || msg.type !== COMFORT_SITE_OVERRIDE_UPDATE_MESSAGE) return false;
  if (!('key' in msg) || (msg.key !== 'siteOverrides' && msg.key !== 'emojiSiteOverrides')) return false;
  if (!('domain' in msg) || typeof msg.domain !== 'string' || msg.domain.length === 0) return false;
  if (!('override' in msg)) return false;
  if (isOverride(msg.override)) return true;
  return msg.override === 'toggle' && msg.key === 'siteOverrides';
}
export function isSettingsUpdateMessage(
  msg: unknown
): msg is { type: string; settings: Partial<ComfortSettings> } {
  if (typeof msg !== 'object' || msg === null) return false;
  if (!('type' in msg) || msg.type !== COMFORT_SETTINGS_UPDATE_MESSAGE) return false;
  return 'settings' in msg && msg.settings !== null && typeof msg.settings === 'object';
}

export function onSettingsChange(callback: (settings: ComfortSettings) => void): void {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[COMFORT_SETTINGS_KEY]) return;
    callback(normalizeSettings(migrate(changes[COMFORT_SETTINGS_KEY].newValue)));
  });
}

export function isActiveForSite(settings: ComfortSettings, domain: string): boolean {
  if (settings.paused) return false;

  const override = getSiteOverride(settings.siteOverrides, domain);
  if (override === 'enabled') return true;
  if (override === 'disabled') return false;
  return getGlobalMediaDefault(settings) === 'enabled';
}

export function isEmojiBlockedForSite(settings: ComfortSettings, domain: string): boolean {
  if (settings.paused) return false;

  const override = getSiteOverride(settings.emojiSiteOverrides, domain);
  if (override === 'enabled') return true;
  if (override === 'disabled') return false;
  return settings.blockEmojis;
}

export async function setSiteOverride(domain: string, override: SiteOverride): Promise<void> {
  if (await tryApplySiteOverrideViaBackground('siteOverrides', domain, override)) return;
  await applySiteOverrideUpdate('siteOverrides', domain, override);
}

export async function setEmojiSiteOverride(
  domain: string,
  override: SiteOverride
): Promise<void> {
  if (await tryApplySiteOverrideViaBackground('emojiSiteOverrides', domain, override)) return;
  await applySiteOverrideUpdate('emojiSiteOverrides', domain, override);
}

export async function togglePause(): Promise<boolean> {
  const current = await getSettings();
  const paused = !current.paused;
  await saveSettings({ paused });
  return paused;
}

export async function setGlobalMediaEnabled(enabled: boolean): Promise<void> {
  await saveSettings({ enabled });
}

export async function toggleGlobalMedia(): Promise<boolean> {
  const settings = await getSettings();
  const enabled = !settings.enabled;
  await setGlobalMediaEnabled(enabled);
  return enabled;
}

export async function toggleSiteOverride(domain: string): Promise<SiteOverride> {
  if (!isBackgroundContext() && typeof browser?.runtime?.sendMessage === 'function') {
    let response: unknown;
    try {
      response = await browser.runtime.sendMessage({
        type: COMFORT_SITE_OVERRIDE_UPDATE_MESSAGE,
        key: 'siteOverrides',
        domain,
        override: 'toggle',
      });
    } catch {
      return await toggleSiteOverrideQueued(domain);
    }
    if (
      typeof response === 'object'
      && response !== null
      && 'ok' in response
      && response.ok === true
      && 'next' in response
      && isOverride(response.next)
    ) {
      return response.next;
    }
    if (typeof response === 'object' && response !== null && 'ok' in response && response.ok === false) {
      throw new Error(PERSISTENCE_ERROR_MESSAGE);
    }
    return await toggleSiteOverrideQueued(domain);
  }
  return toggleSiteOverrideQueued(domain);
}

async function toggleSiteOverrideQueued(domain: string): Promise<SiteOverride> {
  let next: SiteOverride = 'default';
  const run = writeQueue.then(async () => {
    const settings = await getSettings();
    const globalEquivalent = getGlobalMediaDefault(settings);
    const reverseOfGlobal = globalEquivalent === 'enabled' ? 'disabled' : 'enabled';
    const currentOverride = settings.siteOverrides[domain] ?? 'default';
    next = currentOverride === reverseOfGlobal ? 'default' : reverseOfGlobal;

    const nextOverrides = { ...settings.siteOverrides };
    if (next === 'default') {
      delete nextOverrides[domain];
    } else {
      nextOverrides[domain] = next;
    }

    await browser.storage.local.set({
      [COMFORT_SETTINGS_KEY]: normalizeSettings({ ...settings, siteOverrides: nextOverrides }),
    });
  });
  writeQueue = run.catch(() => {});
  await run;
  return next;
}

export function getGlobalMediaDefault(settings: ComfortSettings): SiteOverride {
  return settings.enabled ? 'enabled' : 'disabled';
}
