import type { ComfortSettings } from './types';
import { isActiveForSite } from './storage';

export interface BrowserActionPresentation {
  title: string;
}

export function getBrowserActionPresentation(
  settings: ComfortSettings,
  domain: string
): BrowserActionPresentation {
  if (settings.paused) {
    return { title: 'Cognitive Comfort — Paused' };
  }

  if (!domain) {
    return settings.enabled
      ? { title: 'Cognitive Comfort — Active' }
      : { title: 'Cognitive Comfort — Media shown globally' };
  }

  return isActiveForSite(settings, domain)
    ? { title: `Cognitive Comfort — Media blurred on ${domain}` }
    : { title: `Cognitive Comfort — Media shown on ${domain}` };
}
