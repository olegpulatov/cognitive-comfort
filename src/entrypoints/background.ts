import { getBrowserActionPresentation } from '../utils/browser-action';
import { getDomain } from '../utils/domain';
import {
  COMFORT_SETTINGS_CHANGED_MESSAGE,
  applySettingsUpdate,
  applySiteOverrideUpdate,
  getSettings,
  isSettingsUpdateMessage,
  isSiteOverrideUpdateMessage,
  onSettingsChange,
  toggleGlobalMedia,
  togglePause,
  toggleSiteOverride,
} from '../utils/storage';

async function updateBrowserActionForTab(tab?: { id?: number; url?: string }): Promise<void> {
  const actionApi = browser.action ?? (browser as unknown as { browserAction?: typeof browser.action }).browserAction;
  if (!actionApi) return;

  const settings = await getSettings();
  const url = tab?.url ?? '';
  const domain = url ? getDomain(url) : '';
  const tabId = tab?.id;

  const presentation = getBrowserActionPresentation(settings, domain);
  await actionApi.setTitle({ title: presentation.title, tabId }).catch(() => {});
}

async function updateBrowserAction(): Promise<void> {
  const tabs = await browser.tabs.query({ active: true }).catch(() => []);
  for (const tab of tabs) {
    await updateBrowserActionForTab(tab);
  }
}

async function updateContentScripts(): Promise<void> {
  const tabs = await browser.tabs.query({}).catch(() => []);

  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id === undefined) return;

      await browser.tabs.sendMessage(tab.id, {
        type: COMFORT_SETTINGS_CHANGED_MESSAGE,
      }).catch(() => {});
    })
  );
}

let contentScriptUpdatePending = false;
let contentScriptUpdateRunning = false;

function queueContentScriptUpdate(): void {
  contentScriptUpdatePending = true;
  if (contentScriptUpdateRunning) return;

  contentScriptUpdateRunning = true;
  void (async () => {
    try {
      while (contentScriptUpdatePending) {
        contentScriptUpdatePending = false;
        await updateContentScripts();
      }
    } catch {
      // A later settings change can retry a failed notification.
    } finally {
      contentScriptUpdateRunning = false;
      if (contentScriptUpdatePending) queueContentScriptUpdate();
    }
  })();
}

export default defineBackground(() => {
  onSettingsChange(() => {
    void updateBrowserAction();
    queueContentScriptUpdate();
  });

  browser.tabs.onActivated?.addListener((activeInfo) => {
    browser.tabs.get(activeInfo.tabId).then((tab) => {
      void updateBrowserActionForTab(tab);
    }).catch(() => {
      void updateBrowserAction();
    });
  });

  browser.tabs.onUpdated?.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.status === 'complete') {
      void updateBrowserActionForTab(tab ?? { id: tabId, url: changeInfo.url });
    }
  });

  void updateBrowserAction();

  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const operation = isSettingsUpdateMessage(msg)
      ? applySettingsUpdate(msg.settings)
      : isSiteOverrideUpdateMessage(msg)
        ? msg.override === 'toggle'
          ? toggleSiteOverride(msg.domain)
          : applySiteOverrideUpdate(msg.key, msg.domain, msg.override)
        : null;

    if (!operation) return;

    operation
      .then((result) => sendResponse({ ok: true, next: result }))
      .catch(() => sendResponse({ ok: false }));

    return true;
  });

  browser.commands.onCommand.addListener(async (command) => {
    if (command === 'toggle-pause') {
      const paused = await togglePause();
      console.log('Cognitive Comfort extension:', paused ? 'paused' : 'active');
      void updateBrowserAction();
      return;
    }

    if (command === 'toggle-site') {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) return;

      const domain = getDomain(tab.url);
      if (!domain) return;
      const nextState = await toggleSiteOverride(domain);
      console.log('Cognitive Comfort for', domain + ':', nextState);
      void updateBrowserAction();
      return;
    }

    if (command === 'peek-show') {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        await browser.tabs.sendMessage(tab.id, { type: 'peek-pulse' }).catch(() => {});
      }
      return;
    }

    if (command === 'toggle-global') {
      const enabled = await toggleGlobalMedia();
      console.log('Cognitive Comfort global media:', enabled ? 'hide' : 'show');
      void updateBrowserAction();
    }
  });
});
