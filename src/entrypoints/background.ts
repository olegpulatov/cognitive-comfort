import { getDomain } from '../utils/domain';
import {
  applySettingsUpdate,
  applySiteOverrideUpdate,
  getSettings,
  isActiveForSite,
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

  if (settings.paused) {
    await actionApi.setTitle({ title: 'Cognitive Comfort — Paused', tabId }).catch(() => {});
    await actionApi.setBadgeText({ text: '⏸', tabId }).catch(() => {});
    await actionApi.setBadgeBackgroundColor({ color: '#c4705a', tabId }).catch(() => {});
    return;
  }

  if (!domain) {
    if (!settings.enabled) {
      await actionApi.setTitle({ title: 'Cognitive Comfort — Media shown globally', tabId }).catch(() => {});
      await actionApi.setBadgeText({ text: '○', tabId }).catch(() => {});
      await actionApi.setBadgeBackgroundColor({ color: '#8d7240', tabId }).catch(() => {});
    } else {
      await actionApi.setTitle({ title: 'Cognitive Comfort — Active', tabId }).catch(() => {});
      await actionApi.setBadgeText({ text: '', tabId }).catch(() => {});
    }
    return;
  }

  const active = isActiveForSite(settings, domain);
  if (!active) {
    const title = `Cognitive Comfort — Media shown on ${domain}`;
    await actionApi.setTitle({ title, tabId }).catch(() => {});
    await actionApi.setBadgeText({ text: '○', tabId }).catch(() => {});
    await actionApi.setBadgeBackgroundColor({ color: '#8d7240', tabId }).catch(() => {});
  } else {
    await actionApi.setTitle({ title: `Cognitive Comfort — Media blurred on ${domain}`, tabId }).catch(() => {});
    await actionApi.setBadgeText({ text: '', tabId }).catch(() => {});
  }
}

async function updateBrowserAction(): Promise<void> {
  const tabs = await browser.tabs.query({ active: true }).catch(() => []);
  for (const tab of tabs) {
    await updateBrowserActionForTab(tab);
  }
}

export default defineBackground(() => {
  onSettingsChange(() => {
    void updateBrowserAction();
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
