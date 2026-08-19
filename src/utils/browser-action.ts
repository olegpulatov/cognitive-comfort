import type { ComfortSettings } from './types';
import { isActiveForSite } from './storage';

export interface BrowserActionPresentation {
  title: string;
  badgeText: string;
  badgeColor?: string;
}

export function getBrowserActionPresentation(
  settings: ComfortSettings,
  domain: string
): BrowserActionPresentation {
  if (settings.paused) {
    return {
      title: 'Cognitive Comfort — Paused',
      badgeText: '⏸',
      badgeColor: '#c4705a',
    };
  }

  if (!domain) {
    return settings.enabled
      ? { title: 'Cognitive Comfort — Active', badgeText: '' }
      : {
          title: 'Cognitive Comfort — Media shown globally',
          badgeText: '○',
          badgeColor: '#8d7240',
        };
  }

  return isActiveForSite(settings, domain)
    ? { title: `Cognitive Comfort — Media blurred on ${domain}`, badgeText: '' }
    : {
        title: `Cognitive Comfort — Media shown on ${domain}`,
        badgeText: '○',
        badgeColor: '#8d7240',
      };
}
