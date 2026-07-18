import type { BlurScope, RevealMode, SiteOverride } from '../../utils/types';
import { getBaseDomain, getDomain, getSiteOverride } from '../../utils/domain';
import {
  getSettings,
  onSettingsChange,
  saveSettings,
  setEmojiSiteOverride,
  setGlobalMediaEnabled,
  setSiteOverride,
  togglePause,
} from '../../utils/storage';
import { openShortcutSettings } from './browser-support';

const elements = {
  pauseBtn: document.getElementById('pauseBtn') as HTMLButtonElement,
  currentDomain: document.getElementById('currentDomain') as HTMLSpanElement,
  globalEnabled: document.getElementById('globalEnabled') as HTMLButtonElement,
  globalDisabled: document.getElementById('globalDisabled') as HTMLButtonElement,
  siteEnabled: document.getElementById('siteEnabled') as HTMLButtonElement,
  siteDisabled: document.getElementById('siteDisabled') as HTMLButtonElement,
  siteDefault: document.getElementById('siteDefault') as HTMLButtonElement,
  emojiGlobalEnabled: document.getElementById('emojiGlobalEnabled') as HTMLButtonElement,
  emojiGlobalDisabled: document.getElementById('emojiGlobalDisabled') as HTMLButtonElement,
  emojiSiteEnabled: document.getElementById('emojiSiteEnabled') as HTMLButtonElement,
  emojiSiteDisabled: document.getElementById('emojiSiteDisabled') as HTMLButtonElement,
  emojiSiteDefault: document.getElementById('emojiSiteDefault') as HTMLButtonElement,
  blurScope: document.getElementById('blurScope') as HTMLSelectElement,
  revealMode: document.getElementById('revealMode') as HTMLSelectElement,
  blurAmount: document.getElementById('blurAmount') as HTMLInputElement,
  blurAmountValue: document.getElementById('blurAmountValue') as HTMLSpanElement,
  shortcutsList: document.getElementById('shortcutsList') as HTMLDivElement,
  shortcutHelp: document.getElementById('shortcutHelp') as HTMLDivElement,
  editShortcuts: document.getElementById('editShortcuts') as HTMLButtonElement,
};

const shortcutLabels: Record<string, string> = {
  'toggle-pause': 'Pause Extension',
  'toggle-site': 'Toggle Site',
  'peek-show': 'Peek',
  'toggle-global': 'Toggle Global Media',
};

let currentDomain = '';
let blurAmountSaveTimer: ReturnType<typeof setTimeout> | null = null;

const SITE_CONTROL_BUTTON_IDS = [
  'siteEnabled',
  'siteDisabled',
  'siteDefault',
  'emojiSiteEnabled',
  'emojiSiteDisabled',
  'emojiSiteDefault',
] as const;

function setSiteControlsEnabled(enabled: boolean): void {
  for (const id of SITE_CONTROL_BUTTON_IDS) {
    const button = document.getElementById(id) as HTMLButtonElement | null;
    if (button) button.disabled = !enabled;
  }
}
async function init(): Promise<void> {
  const settings = await getSettings();
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

  currentDomain = tab?.url ? getDomain(tab.url) : '';

  if (currentDomain) {
    elements.currentDomain.textContent = currentDomain;
    setSiteControlsEnabled(true);
  } else {
    elements.currentDomain.textContent = 'Open on a website';
    setSiteControlsEnabled(false);
  }

  updatePauseButton(settings);
  updateGlobalButtons(settings);
  updateSiteControls(settings);
  updateForm(settings);
  onSettingsChange((nextSettings) => {
    updatePauseButton(nextSettings);
    updateGlobalButtons(nextSettings);
    updateSiteControls(nextSettings);
    updateForm(nextSettings);
  });

  elements.pauseBtn.addEventListener('click', async () => {
    await togglePause();
  });

  elements.globalEnabled.addEventListener('click', () => setGlobalMediaEnabled(true));
  elements.globalDisabled.addEventListener('click', () => setGlobalMediaEnabled(false));

  elements.siteEnabled.addEventListener('click', () => handleSiteButton('enabled'));
  elements.siteDisabled.addEventListener('click', () => handleSiteButton('disabled'));
  elements.siteDefault.addEventListener('click', () => handleSiteButton('default'));

  elements.emojiGlobalEnabled.addEventListener('click', () => saveSettings({ blockEmojis: true }));
  elements.emojiGlobalDisabled.addEventListener('click', () => saveSettings({ blockEmojis: false }));
  elements.emojiSiteEnabled.addEventListener('click', () => handleEmojiSiteButton('enabled'));
  elements.emojiSiteDisabled.addEventListener('click', () => handleEmojiSiteButton('disabled'));
  elements.emojiSiteDefault.addEventListener('click', () => handleEmojiSiteButton('default'));

  elements.blurScope.addEventListener('change', () => {
    saveSettings({ blurScope: elements.blurScope.value as BlurScope });
  });

  elements.revealMode.addEventListener('change', () => {
    saveSettings({ revealMode: elements.revealMode.value as RevealMode });
  });

  elements.blurAmount.addEventListener('input', () => {
    const blurAmount = Number(elements.blurAmount.value);
    elements.blurAmountValue.textContent = String(blurAmount);

    if (blurAmountSaveTimer) {
      clearTimeout(blurAmountSaveTimer);
    }

    blurAmountSaveTimer = setTimeout(() => {
      saveSettings({ blurAmount });
    }, 150);
  });

  elements.editShortcuts.addEventListener('click', async () => {
    const message = await openShortcutSettings();
    elements.shortcutHelp.hidden = !message;
    elements.shortcutHelp.textContent = message ?? '';
  });
  await loadShortcuts();
}

function updateForm(settings: Awaited<ReturnType<typeof getSettings>>): void {
  elements.emojiGlobalEnabled.classList.toggle('active', settings.blockEmojis);
  elements.emojiGlobalDisabled.classList.toggle('active', !settings.blockEmojis);
  elements.blurScope.value = settings.blurScope;
  elements.revealMode.value = settings.revealMode;
  elements.blurAmount.value = String(settings.blurAmount);
  elements.blurAmountValue.textContent = String(settings.blurAmount);
}

function updatePauseButton(settings: Awaited<ReturnType<typeof getSettings>>): void {
  elements.pauseBtn.textContent = settings.paused ? 'Resume' : 'Pause';
  elements.pauseBtn.classList.toggle('paused', settings.paused);
}

function updateGlobalButtons(settings: Awaited<ReturnType<typeof getSettings>>): void {
  elements.globalEnabled.classList.toggle('active', settings.enabled);
  elements.globalDisabled.classList.toggle('active', !settings.enabled);
}

function updateSiteControls(settings: Awaited<ReturnType<typeof getSettings>>): void {
  const siteOverride = getSiteOverride(settings.siteOverrides, currentDomain);
  const emojiOverride = getSiteOverride(settings.emojiSiteOverrides, currentDomain);
  const baseDomain = getBaseDomain(currentDomain);

  const siteInheritedFrom =
    baseDomain && !settings.siteOverrides[currentDomain] && settings.siteOverrides[baseDomain]
      ? baseDomain
      : null;

  const emojiInheritedFrom =
    baseDomain &&
    !settings.emojiSiteOverrides[currentDomain] &&
    settings.emojiSiteOverrides[baseDomain]
      ? baseDomain
      : null;

  updateSiteButtons(siteOverride, siteInheritedFrom);
  updateEmojiSiteButtons(emojiOverride, emojiInheritedFrom);
}

function handleSiteButton(value: SiteOverride): void {
  if (!currentDomain) return;
  setSiteOverride(currentDomain, value);
  updateSiteButtons(value);
}

function handleEmojiSiteButton(value: SiteOverride): void {
  if (!currentDomain) return;
  setEmojiSiteOverride(currentDomain, value);
  updateEmojiSiteButtons(value);
}

function updateSiteButtons(active: SiteOverride, inheritedFrom: string | null = null): void {
  updateTriStateButtons(
    {
      enabled: elements.siteEnabled,
      disabled: elements.siteDisabled,
      default: elements.siteDefault,
    },
    active,
    inheritedFrom
  );
}

function updateEmojiSiteButtons(active: SiteOverride, inheritedFrom: string | null = null): void {
  updateTriStateButtons(
    {
      enabled: elements.emojiSiteEnabled,
      disabled: elements.emojiSiteDisabled,
      default: elements.emojiSiteDefault,
    },
    active,
    inheritedFrom
  );
}

function updateTriStateButtons(
  buttons: Record<SiteOverride, HTMLButtonElement>,
  active: SiteOverride,
  inheritedFrom: string | null
): void {
  for (const [value, button] of Object.entries(buttons) as [SiteOverride, HTMLButtonElement][]) {
    button.classList.toggle('active', value === active);
    button.classList.remove('inherited');
    button.removeAttribute('title');
  }

  if (!inheritedFrom) return;

  const activeButton = buttons[active];
  activeButton.classList.add('inherited');
  activeButton.title = `Inherited from ${inheritedFrom}`;
}

async function loadShortcuts(): Promise<void> {
  elements.shortcutsList.innerHTML = '';
  let commands: Array<{
    name?: string;
    description?: string;
    shortcut?: string;
  }> = [];

  try {
    commands = await browser.commands.getAll();
  } catch {
    return;
  }

  for (const command of commands) {
    if (!command.name || !(command.name in shortcutLabels)) continue;

    const item = document.createElement('div');
    item.className = 'shortcut-item';

    const label = shortcutLabels[command.name] || command.description || command.name;
    const shortcut = command.shortcut || 'Not set';
    const notSet = !command.shortcut;

    const nameElement = document.createElement('span');
    nameElement.className = 'shortcut-name';
    nameElement.textContent = label;

    const keyElement = document.createElement('span');
    keyElement.className = `shortcut-key${notSet ? ' not-set' : ''}`;
    keyElement.textContent = shortcut;
    item.append(nameElement, keyElement);

    elements.shortcutsList.appendChild(item);
  }
}

declare const __BUILD_HASH__: string;
declare const __BUILD_TIME__: string;
declare const __BUILD_VERSION__: string;
declare const __BUILD_PROFILE__: string;
function showBuildInfo(): void {
  const element = document.getElementById('buildInfo');
  if (element) {
    element.textContent = `v${__BUILD_VERSION__} (${__BUILD_HASH__}) ${__BUILD_TIME__} · ${__BUILD_PROFILE__}`;
  }
}

showBuildInfo();
init();
