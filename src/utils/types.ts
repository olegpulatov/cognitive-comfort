export type BlurScope = 'content' | 'all';
export type RevealMode = 'hover' | 'click' | 'both';
export type SiteOverride = 'enabled' | 'disabled' | 'default';

export interface ComfortSettings {
  schemaVersion: number;
  enabled: boolean;
  blurScope: BlurScope;
  revealMode: RevealMode;
  blurAmount: number;
  paused: boolean;
  blockEmojis: boolean;
  siteOverrides: Record<string, SiteOverride>;
  emojiSiteOverrides: Record<string, SiteOverride>;
}
