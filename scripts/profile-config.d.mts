import type { ComfortSettings } from '../src/utils/types';

export interface ProfileConfig {
  meta: {
    name: string;
  };
  product: {
    name: string;
    description: string;
    firefoxExtensionId: string;
  };
  defaults: ComfortSettings;
  distribution: {
    safariAppName: string;
    safariBundleId: string;
  };
}

export function getProfileName(inputProfile?: string): string;
export function loadProfileConfig(inputProfile?: string): ProfileConfig;
