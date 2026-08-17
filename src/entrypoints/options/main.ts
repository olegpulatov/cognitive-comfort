import type { BlurScope, ComfortSettings, RevealMode, SiteOverride } from '../../utils/types';
import {
  getSettings,
  onSettingsChange,
  saveSettings,
  setEmojiSiteOverride,
  setGlobalMediaEnabled,
  setSiteOverride,
  togglePause,
} from '../../utils/storage';
import { openShortcutSettings } from '../popup/browser-support';

const elements = {
  pauseBtn: document.getElementById('pauseBtn') as HTMLButtonElement,
  statusLedger: document.getElementById('statusLedger') as HTMLDivElement,
  statusText: document.getElementById('statusText') as HTMLSpanElement,
  statusBecause: document.getElementById('statusBecause') as HTMLSpanElement,
  saveNotice: document.getElementById('saveNotice') as HTMLDivElement,
  defaultsSheet: document.getElementById('defaultsSheet') as HTMLElement,
  coverageSheet: document.getElementById('coverageSheet') as HTMLElement,
  revealSheet: document.getElementById('revealSheet') as HTMLElement,
  blurSheet: document.getElementById('blurSheet') as HTMLElement,
  pauseStamp: document.getElementById('pauseStamp') as HTMLDivElement,
  blurAmount: document.getElementById('blurAmount') as HTMLInputElement,
  blurAmountValue: document.getElementById('blurAmountValue') as HTMLSpanElement,
  siteRules: document.getElementById('siteRules') as HTMLDivElement,
  shortcutsList: document.getElementById('shortcutsList') as HTMLDivElement,
  shortcutHelp: document.getElementById('shortcutHelp') as HTMLDivElement,
  editShortcuts: document.getElementById('editShortcuts') as HTMLButtonElement,
};

const shortcutLabels: Record<string, string> = {
  'peek-show': 'Peek',
  'toggle-global': 'Toggle global media',
  'toggle-pause': 'Pause extension',
  'toggle-site': 'Toggle this site',
};

let blurAmountSaveTimer: number | undefined;
let pauseShortcut = '';
let renderedDomains: readonly string[] = [];
let rulesRendered = false;

function radioInputs(name: string): NodeListOf<HTMLInputElement> {
  return document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`);
}

function setRadioValue(name: string, value: string): void {
  for (const input of radioInputs(name)) input.checked = input.value === value;
}

async function persist(
  operation: () => Promise<unknown>,
  changedSheet?: HTMLElement,
  successMessage?: string
): Promise<void> {
  try {
    await operation();
    elements.saveNotice.textContent = successMessage ?? '';
    elements.saveNotice.hidden = !successMessage;
    elements.saveNotice.classList.toggle('is-ok', Boolean(successMessage));
    if (changedSheet) fileCard(changedSheet);
  } catch {
    elements.saveNotice.textContent =
      'That change could not be saved, so it is not in effect. Try again.';
    elements.saveNotice.hidden = false;
    elements.saveNotice.classList.remove('is-ok');
  }
}

function fileCard(sheet: HTMLElement): void {
  sheet.classList.remove('sheet-filed');
  // Force a reflow so the animation restarts on a repeated choice.
  void sheet.offsetWidth;
  sheet.classList.add('sheet-filed');
}

function render(settings: ComfortSettings): void {
  elements.pauseBtn.textContent = settings.paused ? 'Resume' : 'Pause';
  elements.pauseBtn.classList.toggle('is-engaged', settings.paused);

  elements.statusLedger.classList.toggle('is-paused', settings.paused);
  elements.statusLedger.classList.toggle('is-off', !settings.paused && !settings.enabled);
  if (settings.paused) {
    elements.statusText.textContent = 'Paused everywhere. No media is blurred and no emoji is hidden.';
  } else if (settings.enabled) {
    elements.statusText.textContent = 'Media is blurred on every site that has no rule of its own.';
  } else {
    elements.statusText.textContent = 'Media is shown everywhere by default.';
  }
  elements.statusBecause.textContent = pauseShortcut
    ? `Pause shortcut: ${pauseShortcut}.`
    : '';
  elements.statusBecause.hidden = !pauseShortcut;

  elements.pauseStamp.hidden = !settings.paused;

  setRadioValue('mediaDefault', settings.enabled ? 'enabled' : 'disabled');
  setRadioValue('emojiDefault', settings.blockEmojis ? 'enabled' : 'disabled');
  setRadioValue('blurScope', settings.blurScope);
  setRadioValue('revealMode', settings.revealMode);
  elements.blurAmount.value = String(settings.blurAmount);
  elements.blurAmountValue.textContent = String(settings.blurAmount);
  renderSiteRules(settings);
}

function domainId(domain: string): string {
  const encoded = Array.from(new TextEncoder().encode(domain), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `domain-${encoded}`;
}

function makeRuleGroup(
  domain: string,
  kind: 'media' | 'emoji',
  current: SiteOverride,
  options: ReadonlyArray<readonly [SiteOverride, string]>,
  onChange: (value: SiteOverride) => Promise<void>
): HTMLFieldSetElement {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'field';
  const legend = document.createElement('legend');
  legend.className = 'field-legend';
  legend.textContent = kind === 'media' ? 'Media' : 'Emoji';
  const segments = document.createElement('div');
  segments.className = 'segments';
  const prefix = `${domainId(domain)}-${kind}`;

  for (const [value, text] of options) {
    const label = document.createElement('label');
    label.className = 'segment';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = prefix;
    input.id = `${prefix}-${value}`;
    input.value = value;
    input.checked = current === value;
    input.addEventListener('change', () => {
      if (input.checked) {
        const row = input.closest<HTMLElement>('.site-rule');
        void persist(() => onChange(value), row ?? undefined);
      }
    });
    const caption = document.createElement('span');
    caption.textContent = text;
    label.append(input, caption);
    segments.append(label);
  }

  fieldset.append(legend, segments);
  return fieldset;
}

function renderSiteRules(settings: ComfortSettings): void {
  const domains = Array.from(new Set([
    ...Object.keys(settings.siteOverrides),
    ...Object.keys(settings.emojiSiteOverrides),
  ])).sort((left, right) => left.localeCompare(right));
  const domainsChanged =
    !rulesRendered ||
    domains.length !== renderedDomains.length ||
    domains.some((domain, index) => domain !== renderedDomains[index]);

  if (!domainsChanged) {
    for (const domain of domains) {
      setRadioValue(
        `${domainId(domain)}-media`,
        settings.siteOverrides[domain] ?? 'default'
      );
      setRadioValue(
        `${domainId(domain)}-emoji`,
        settings.emojiSiteOverrides[domain] ?? 'default'
      );
    }
    return;
  }

  const focusedId =
    document.activeElement instanceof HTMLElement ? document.activeElement.id : '';
  renderedDomains = domains;
  rulesRendered = true;
  elements.siteRules.replaceChildren();

  if (domains.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'field-note';
    empty.textContent = 'No site rules are filed yet. Rules are filed from the toolbar popup while visiting a site.';
    elements.siteRules.append(empty);
    restoreFocus(focusedId);
    return;
  }

  const mediaOptions = [
    ['enabled', 'Blur'],
    ['disabled', 'Show'],
    ['default', 'Use global'],
  ] as const;
  const emojiOptions = [
    ['enabled', 'Hide'],
    ['disabled', 'Show'],
    ['default', 'Use global'],
  ] as const;

  for (const domain of domains) {
    const row = document.createElement('article');
    row.className = 'site-rule';
    const subject = document.createElement('h3');
    subject.className = 'sheet-subject';
    subject.id = `${domainId(domain)}-heading`;
    subject.textContent = domain;
    row.setAttribute('aria-labelledby', subject.id);
    const controls = document.createElement('div');
    controls.className = 'site-rule-controls';
    controls.append(
      makeRuleGroup(domain, 'media', settings.siteOverrides[domain] ?? 'default', mediaOptions, (value) => setSiteOverride(domain, value)),
      makeRuleGroup(domain, 'emoji', settings.emojiSiteOverrides[domain] ?? 'default', emojiOptions, (value) => setEmojiSiteOverride(domain, value))
    );
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'press-link site-rule-remove';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove rule for ${domain}`);
    remove.addEventListener('click', () => void persist(async () => {
      await setSiteOverride(domain, 'default');
      await setEmojiSiteOverride(domain, 'default');
    }, undefined, `Rule for ${domain} removed.`));
    controls.append(remove);
    row.append(subject, controls);
    elements.siteRules.append(row);
  }

  restoreFocus(focusedId);
}

/**
 * A rebuild destroys the row the user was working in - choosing "Use global" for a
 * domain's only rule unfiles it. Land focus on the list itself rather than dropping
 * the keyboard user at the top of the document.
 */
function restoreFocus(focusedId: string): void {
  if (!focusedId) return;

  const restored = document.getElementById(focusedId);
  if (restored) {
    restored.focus();
    return;
  }

  elements.siteRules.focus();
}

function wireRadioGroup(
  name: string,
  sheet: HTMLElement,
  save: (value: string) => Promise<void>
): void {
  for (const input of radioInputs(name)) {
    input.addEventListener('change', () => {
      if (input.checked) void persist(() => save(input.value), sheet);
    });
  }
}

async function loadShortcuts(): Promise<void> {
  elements.shortcutsList.replaceChildren();
  let commands: Array<{ name?: string; description?: string; shortcut?: string }> = [];
  try {
    commands = await browser.commands.getAll();
  } catch {
    return;
  }

  const commandByName: Record<string, { name?: string; description?: string; shortcut?: string }> =
    Object.fromEntries(commands.map((command) => [command.name ?? '', command]));
  pauseShortcut = commandByName['toggle-pause']?.shortcut ?? '';
  for (const [commandName, label] of Object.entries(shortcutLabels)) {
    const shortcut = commandByName[commandName]?.shortcut ?? '';
    const item = document.createElement('div');
    item.className = 'shortcut-item';
    const nameElement = document.createElement('span');
    nameElement.className = 'shortcut-name';
    nameElement.textContent = label;
    const keyElement = document.createElement('span');
    keyElement.className = `shortcut-key${shortcut ? '' : ' not-set'}`;
    keyElement.textContent = shortcut || 'Not set';
    item.append(nameElement, keyElement);
    elements.shortcutsList.append(item);
  }
}

async function init(): Promise<void> {
  const settings = await getSettings();
  await loadShortcuts();
  render(settings);
  onSettingsChange(render);

  elements.pauseBtn.addEventListener('click', () => void persist(() => togglePause()));
  wireRadioGroup('mediaDefault', elements.defaultsSheet, (value) => setGlobalMediaEnabled(value === 'enabled'));
  wireRadioGroup('emojiDefault', elements.defaultsSheet, (value) => saveSettings({ blockEmojis: value === 'enabled' }));
  wireRadioGroup('blurScope', elements.coverageSheet, (value) => saveSettings({ blurScope: value as BlurScope }));
  wireRadioGroup('revealMode', elements.revealSheet, (value) => saveSettings({ revealMode: value as RevealMode }));
  elements.blurAmount.addEventListener('input', () => {
    const blurAmount = Number(elements.blurAmount.value);
    elements.blurAmountValue.textContent = String(blurAmount);
    clearTimeout(blurAmountSaveTimer);
    blurAmountSaveTimer = window.setTimeout(
      () => void persist(() => saveSettings({ blurAmount }), elements.blurSheet),
      150
    );
  });
  elements.editShortcuts.addEventListener('click', () => void (async () => {
    try {
      const message = await openShortcutSettings();
      elements.shortcutHelp.textContent = message ?? '';
      elements.shortcutHelp.hidden = !message;
    } catch {
      elements.shortcutHelp.textContent = 'Open your browser extension settings to change keyboard shortcuts.';
      elements.shortcutHelp.hidden = false;
    }
  })());
}

declare const __BUILD_HASH__: string;
declare const __BUILD_TIME__: string;
declare const __BUILD_VERSION__: string;
declare const __BUILD_PROFILE__: string;
const buildInfo = document.getElementById('buildInfo') as HTMLDivElement;
const buildRelease = document.createElement('span');
buildRelease.textContent = `v${__BUILD_VERSION__} (${__BUILD_HASH__})`;
const buildStamp = document.createElement('span');
buildStamp.textContent = `${__BUILD_TIME__} · ${__BUILD_PROFILE__}`;
buildInfo.append(buildRelease, buildStamp);

void init();
