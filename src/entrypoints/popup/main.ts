import type { ComfortSettings, SiteOverride } from '../../utils/types';
import { getBaseDomain, getDomain, getSiteOverride } from '../../utils/domain';
import {
  getGlobalMediaDefault,
  getSettings,
  isActiveForSite,
  isEmojiBlockedForSite,
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
  ledger: document.getElementById('ledger') as HTMLParagraphElement,
  ledgerState: document.getElementById('ledgerState') as HTMLSpanElement,
  ledgerBecause: document.getElementById('ledgerBecause') as HTMLSpanElement,
  saveNotice: document.getElementById('saveNotice') as HTMLDivElement,
  siteSheet: document.getElementById('siteSheet') as HTMLElement,
  globalSheet: document.getElementById('globalSheet') as HTMLElement,
  revealSheet: document.getElementById('revealSheet') as HTMLElement,
  currentDomain: document.getElementById('currentDomain') as HTMLSpanElement,
  siteMediaSegments: document.getElementById('siteMediaSegments') as HTMLDivElement,
  siteEmojiSegments: document.getElementById('siteEmojiSegments') as HTMLDivElement,
  siteMediaNote: document.getElementById('siteMediaNote') as HTMLSpanElement,
  siteEmojiNote: document.getElementById('siteEmojiNote') as HTMLSpanElement,
  blurAmount: document.getElementById('blurAmount') as HTMLInputElement,
  blurAmountValue: document.getElementById('blurAmountValue') as HTMLSpanElement,
  shortcutsList: document.getElementById('shortcutsList') as HTMLDivElement,
  shortcutHelp: document.getElementById('shortcutHelp') as HTMLDivElement,
  editShortcuts: document.getElementById('editShortcuts') as HTMLButtonElement,
  openOptions: document.getElementById('openOptions') as HTMLButtonElement,
};

const shortcutLabels: Record<string, string> = {
  'toggle-pause': 'Pause extension',
  'toggle-site': 'Toggle this site',
  'peek-show': 'Peek',
  'toggle-global': 'Toggle global media',
};

const SITE_CONTROL_IDS = [
  'siteEnabled',
  'siteDisabled',
  'siteDefault',
  'emojiSiteEnabled',
  'emojiSiteDisabled',
  'emojiSiteDefault',
] as const;

let currentDomain = '';
let pauseShortcut = '';
let blurAmountSaveTimer: number | undefined;

function radios(name: string): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`));
}

function selectRadio(name: string, value: string): void {
  for (const radio of radios(name)) radio.checked = radio.value === value;
}

function onRadioChange(name: string, handler: (value: string) => void): void {
  for (const radio of radios(name)) {
    radio.addEventListener('change', () => {
      if (radio.checked) handler(radio.value);
    });
  }
}

function setSiteControlsEnabled(enabled: boolean): void {
  for (const id of SITE_CONTROL_IDS) {
    const control = document.getElementById(id) as HTMLInputElement | null;
    if (control) control.disabled = !enabled;
  }
}

/** A save that fails silently is a lie about what is in effect. */
async function persist(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
    elements.saveNotice.hidden = true;
  } catch {
    elements.saveNotice.textContent =
      'That change could not be saved, so it is not in effect. Try again.';
    elements.saveNotice.hidden = false;
  }
}

function fileCard(sheet: HTMLElement): void {
  sheet.classList.remove('sheet-filed');
  // Force a reflow so the animation restarts on a repeated choice.
  void sheet.offsetWidth;
  sheet.classList.add('sheet-filed');
}

function inheritanceSource(
  overrides: Record<string, SiteOverride>,
  domain: string
): 'own' | 'base' | 'global' {
  if (overrides[domain]) return 'own';
  const baseDomain = getBaseDomain(domain);
  if (baseDomain && overrides[baseDomain]) return 'base';
  return 'global';
}

function render(settings: ComfortSettings): void {
  renderPause(settings);
  renderGlobal(settings);
  renderSite(settings);
  renderReveal(settings);
  renderLedger(settings);
}

/**
 * Pause is announced by the button's own label and the ledger sentence, and marked
 * on the record by a stamp. Nothing is grayed: the controls still work, and a saved
 * rule stays readable while it is out of effect.
 */
function renderPause(settings: ComfortSettings): void {
  elements.pauseBtn.textContent = settings.paused ? 'Resume' : 'Pause';
  elements.pauseBtn.classList.toggle('is-engaged', settings.paused);

  const existingStamp = elements.siteSheet.querySelector('.stamp');
  if (settings.paused && !existingStamp) {
    const stamp = document.createElement('span');
    stamp.className = 'stamp';
    stamp.textContent = 'Paused';
    elements.siteSheet.appendChild(stamp);
  } else if (!settings.paused && existingStamp) {
    existingStamp.remove();
  }
}

function renderGlobal(settings: ComfortSettings): void {
  selectRadio('globalMedia', settings.enabled ? 'enabled' : 'disabled');
  selectRadio('globalEmoji', settings.blockEmojis ? 'enabled' : 'disabled');
}

function renderReveal(settings: ComfortSettings): void {
  elements.blurAmount.value = String(settings.blurAmount);
  elements.blurAmountValue.textContent = String(settings.blurAmount);
}

function renderSite(settings: ComfortSettings): void {
  if (!currentDomain) {
    elements.currentDomain.textContent = 'no site';
    elements.currentDomain.classList.add('is-empty');
    setSiteControlsEnabled(false);
    for (const radio of [...radios('siteMedia'), ...radios('siteEmoji')]) radio.checked = false;
    elements.siteMediaSegments.classList.remove('is-inherited');
    elements.siteEmojiSegments.classList.remove('is-inherited');
    elements.siteMediaNote.textContent = 'Open a website to file a rule for it.';
    elements.siteEmojiNote.textContent = '';
    return;
  }

  elements.currentDomain.textContent = currentDomain;
  elements.currentDomain.classList.remove('is-empty');
  setSiteControlsEnabled(true);

  renderSiteField(
    'siteMedia',
    elements.siteMediaSegments,
    elements.siteMediaNote,
    settings.siteOverrides,
    getGlobalMediaDefault(settings) === 'enabled' ? 'blurred' : 'shown'
  );
  renderSiteField(
    'siteEmoji',
    elements.siteEmojiSegments,
    elements.siteEmojiNote,
    settings.emojiSiteOverrides,
    settings.blockEmojis ? 'hidden' : 'shown'
  );
}

function renderSiteField(
  name: string,
  segments: HTMLElement,
  note: HTMLElement,
  overrides: Record<string, SiteOverride>,
  globalWord: string
): void {
  const source = inheritanceSource(overrides, currentDomain);
  const effective = getSiteOverride(overrides, currentDomain);

  selectRadio(name, source === 'base' ? effective : (overrides[currentDomain] ?? 'default'));
  segments.classList.toggle('is-inherited', source === 'base');

  if (source === 'base') {
    const baseDomain = getBaseDomain(currentDomain);
    note.textContent = `Following the rule filed for ${baseDomain}.`;
    note.classList.add('field-note-inherited');
    return;
  }

  note.classList.remove('field-note-inherited');
  note.textContent = source === 'own' ? '' : `Global default: ${globalWord}.`;
}

function renderLedger(settings: ComfortSettings): void {
  const { ledger, ledgerState, ledgerBecause } = elements;
  ledger.classList.remove('is-paused', 'is-off');

  if (settings.paused) {
    ledger.classList.add('is-paused');
    ledgerState.textContent = 'Paused everywhere.';
    ledgerBecause.textContent = pauseShortcut
      ? `Nothing is blurred or hidden. ${pauseShortcut} resumes.`
      : 'Nothing is blurred or hidden until you resume.';
    return;
  }

  if (!currentDomain) {
    ledger.classList.add('is-off');
    ledgerState.textContent = 'This page cannot have its own rule.';
    ledgerBecause.textContent =
      'Browser and extension pages are out of reach. Everything below still applies to websites.';
    return;
  }

  const mediaBlurred = isActiveForSite(settings, currentDomain);
  const emojiHidden = isEmojiBlockedForSite(settings, currentDomain);

  if (!mediaBlurred) ledger.classList.add('is-off');

  ledgerState.textContent = `Media is ${mediaBlurred ? 'blurred' : 'shown'} on ${currentDomain}.`;

  const mediaSource = inheritanceSource(settings.siteOverrides, currentDomain);
  const because =
    mediaSource === 'own'
      ? 'From this site’s own rule.'
      : mediaSource === 'base'
        ? `From the rule filed for ${getBaseDomain(currentDomain)}.`
        : 'From the global default.';

  ledgerBecause.textContent = `${because} Emoji is ${emojiHidden ? 'hidden' : 'shown'} here.`;
}

async function loadShortcuts(): Promise<void> {
  elements.shortcutsList.replaceChildren();

  let commands: Array<{ name?: string; description?: string; shortcut?: string }> = [];
  try {
    commands = await browser.commands.getAll();
  } catch {
    return;
  }

  for (const command of commands) {
    if (!command.name || !(command.name in shortcutLabels)) continue;
    if (command.name === 'toggle-pause') pauseShortcut = command.shortcut ?? '';

    const item = document.createElement('div');
    item.className = 'shortcut-item';

    const name = document.createElement('span');
    name.className = 'shortcut-name';
    name.textContent = shortcutLabels[command.name] ?? command.description ?? command.name;

    const key = document.createElement('span');
    key.className = `shortcut-key${command.shortcut ? '' : ' not-set'}`;
    key.textContent = command.shortcut || 'Not set';

    item.append(name, key);
    elements.shortcutsList.appendChild(item);
  }
}

declare const __BUILD_HASH__: string;
declare const __BUILD_TIME__: string;
declare const __BUILD_VERSION__: string;
declare const __BUILD_PROFILE__: string;

/** The build line is a support tool: it tells a bug report which artifact it saw. */
function showBuildInfo(): void {
  const element = document.getElementById('buildInfo');
  if (!element) return;

  const release = document.createElement('span');
  release.textContent = `v${__BUILD_VERSION__} (${__BUILD_HASH__})`;
  const stamp = document.createElement('span');
  stamp.textContent = `${__BUILD_TIME__} · ${__BUILD_PROFILE__}`;
  element.append(release, stamp);
}

async function init(): Promise<void> {
  const settings = await getSettings();
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

  currentDomain = tab?.url ? getDomain(tab.url) : '';

  await loadShortcuts();
  render(settings);
  onSettingsChange(render);

  elements.pauseBtn.addEventListener('click', () => {
    void persist(() => togglePause());
  });

  onRadioChange('globalMedia', (value) => {
    void persist(() => setGlobalMediaEnabled(value === 'enabled'));
    fileCard(elements.globalSheet);
  });

  onRadioChange('globalEmoji', (value) => {
    void persist(() => saveSettings({ blockEmojis: value === 'enabled' }));
    fileCard(elements.globalSheet);
  });

  onRadioChange('siteMedia', (value) => {
    if (!currentDomain) return;
    void persist(() => setSiteOverride(currentDomain, value as SiteOverride));
    fileCard(elements.siteSheet);
  });

  onRadioChange('siteEmoji', (value) => {
    if (!currentDomain) return;
    void persist(() => setEmojiSiteOverride(currentDomain, value as SiteOverride));
    fileCard(elements.siteSheet);
  });

  elements.blurAmount.addEventListener('input', () => {
    const blurAmount = Number(elements.blurAmount.value);
    elements.blurAmountValue.textContent = String(blurAmount);

    clearTimeout(blurAmountSaveTimer);
    blurAmountSaveTimer = window.setTimeout(() => {
      void persist(() => saveSettings({ blurAmount }));
    }, 150);
  });

  elements.editShortcuts.addEventListener('click', async () => {
    const message = await openShortcutSettings();
    elements.shortcutHelp.hidden = !message;
    elements.shortcutHelp.textContent = message ?? '';
  });

  elements.openOptions.addEventListener('click', () => {
    void browser.runtime.openOptionsPage();
  });
}

showBuildInfo();
void init();
