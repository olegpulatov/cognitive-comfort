import { getDomain } from '../utils/domain';
import {
  applySettingsUpdate,
  applySiteOverrideUpdate,
  isSettingsUpdateMessage,
  isSiteOverrideUpdateMessage,
  toggleGlobalMedia,
  togglePause,
  toggleSiteOverride,
} from '../utils/storage';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const operation = isSettingsUpdateMessage(msg)
      ? applySettingsUpdate(msg.settings)
      : isSiteOverrideUpdateMessage(msg)
        ? applySiteOverrideUpdate(msg.key, msg.domain, msg.override)
        : null;

    if (!operation) return;

    operation
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));

    return true;
  });

  browser.commands.onCommand.addListener(async (command) => {
    if (command === 'toggle-pause') {
      const paused = await togglePause();
      console.log('Cognitive Comfort extension:', paused ? 'paused' : 'active');
      return;
    }

    if (command === 'toggle-site') {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) return;

      const domain = getDomain(tab.url);
      if (!domain) return;
      const nextState = await toggleSiteOverride(domain);
      console.log('Cognitive Comfort for', domain + ':', nextState);
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
    }
  });
});
