/**
 * Vitest setup — fakes the WebExtension `browser` runtime enough for the
 * storage/domain modules (which run in node, where `typeof window === 'undefined'`
 * means storage.ts treats the context as the background script and writes directly).
 *
 * Exposed globals:
 *   - browser               in-memory storage.local + storage.onChanged
 *   - __COMFORT_DEFAULTS__  default settings shape injected at build time by WXT
 *
 * Tests reset state with `browser.storage.local.clear()` in beforeEach.
 */

type StorageArea = Record<string, unknown>;
type ChangeListener = (changes: Record<string, unknown>, area: string) => void;

const memoryStore: StorageArea = {};
const changeListeners = new Set<ChangeListener>();

function emitChange(key: string, newValue: unknown, oldValue: unknown): void {
  const changes = { [key]: { oldValue, newValue } };
  for (const listener of changeListeners) listener(changes, 'local');
}

const browserMock = {
  storage: {
    local: {
      get: async (key: string): Promise<StorageArea> =>
        key in memoryStore ? { [key]: memoryStore[key] } : {},
      set: async (items: StorageArea): Promise<void> => {
        for (const [key, value] of Object.entries(items)) {
          const oldValue = memoryStore[key];
          memoryStore[key] = value;
          emitChange(key, value, oldValue);
        }
      },
      clear: (): void => {
        for (const key of Object.keys(memoryStore)) delete memoryStore[key];
      },
    },
    onChanged: {
      addListener: (listener: ChangeListener): void => {
        changeListeners.add(listener);
      },
      removeListener: (listener: ChangeListener): void => {
        changeListeners.delete(listener);
      },
      hasListener: (listener: ChangeListener): boolean => changeListeners.has(listener),
    },
  },
  runtime: { sendMessage: async (): Promise<unknown> => undefined },
};

const defaults = {
  schemaVersion: 1,
  enabled: true,
  paused: false,
  blockEmojis: false,
  blurScope: 'all' as const,
  revealMode: 'both' as const,
  blurAmount: 50,
  siteOverrides: {},
  emojiSiteOverrides: {},
};

(globalThis as Record<string, unknown>).browser = browserMock;
(globalThis as Record<string, unknown>).__COMFORT_DEFAULTS__ = defaults;

export const resetComfortStorage = browserMock.storage.local.clear;
