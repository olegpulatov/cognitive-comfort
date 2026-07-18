export async function openShortcutSettings(): Promise<string | null> {
  const commandsApi = browser.commands as typeof browser.commands & {
    openShortcutSettings?: () => Promise<void>;
  };

  if (typeof commandsApi.openShortcutSettings === 'function') {
    await commandsApi.openShortcutSettings();
    return null;
  }

  const ua = navigator.userAgent;

  if (ua.includes('Firefox')) {
    await browser.tabs.create({ url: 'about:addons' });
    return null;
  }

  if (/Chrome\/|Chromium\/|Edg\//.test(ua)) {
    await browser.tabs.create({ url: 'chrome://extensions/shortcuts' });
    return null;
  }

  if (/Safari\//.test(ua)) {
    return 'Safari: open Safari > Settings > Extensions to manage this extension and keyboard shortcuts.';
  }

  return 'Open your browser extension settings to change keyboard shortcuts.';
}
