import type { SiteOverride } from './types';

const MULTIPART_TLDS = new Set([
  'co.uk',
  'org.uk',
  'gov.uk',
  'ac.uk',
  'com.au',
  'net.au',
  'org.au',
  'co.nz',
  'com.br',
  'com.tr',
  'co.jp',
  'co.kr',
  'com.sg',
  'com.hk',
  'com.mx',
]);

export function getDomain(url: string): string {
  if (!/^https?:\/\//i.test(url)) return '';

  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function getBaseDomain(hostname: string): string | null {
  const parts = hostname.split('.').filter(Boolean);
  if (parts.length < 3) return null;

  const lastTwo = parts.slice(-2).join('.');
  if (MULTIPART_TLDS.has(lastTwo)) {
    if (parts.length < 4) return null;
    return parts.slice(-3).join('.');
  }

  return parts.slice(-2).join('.');
}

export function getSiteOverride(
  overrides: Record<string, SiteOverride>,
  domain: string
): SiteOverride {
  if (overrides[domain]) {
    return overrides[domain];
  }

  const baseDomain = getBaseDomain(domain);
  if (baseDomain && overrides[baseDomain]) {
    return overrides[baseDomain];
  }

  return 'default';
}
