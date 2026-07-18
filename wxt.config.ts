import { defineConfig } from 'wxt';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { loadProfileConfig } from './scripts/profile-config.mjs';

const browser = process.env.BROWSER || 'chromium';
const debugPort = parseInt(process.env.DEBUG_PORT || '6202', 10);
const profile = loadProfileConfig();
const packageVersion = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;

function getGitMetadata(): { hash: string; time: string } {
  try {
    const [hash, time] = execFileSync('git', ['show', '-s', '--format=%h%n%cI', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .trimEnd()
      .split('\n');

    if (!hash || !time) {
      throw new Error('Git metadata output is incomplete.');
    }

    return { hash, time };
  } catch {
    return { hash: 'unknown', time: 'unknown' };
  }
}

const gitMetadata = getGitMetadata();
const firefoxGeckoSettings = {
  id: profile.product.firefoxExtensionId,
  strict_min_version: '140.0',
  data_collection_permissions: {
    required: ['none'],
  },
};

const binaries: Record<string, string> = {
  chrome: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  chromium: '/Applications/Chromium.app/Contents/MacOS/Chromium',
  firefox: '/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox',
  edge: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
};

const isChromium = ['chrome', 'chromium', 'edge'].includes(browser);

export default defineConfig({
  srcDir: 'src',
  vite: () => ({
    define: {
      __BUILD_VERSION__: JSON.stringify(packageVersion),
      __BUILD_HASH__: JSON.stringify(gitMetadata.hash),
      __BUILD_TIME__: JSON.stringify(gitMetadata.time),
      __BUILD_PROFILE__: JSON.stringify(profile.meta.name),
      __COMFORT_DEFAULTS__: JSON.stringify(profile.defaults),
    },
    build: { minify: false },
  }),
  manifest: {
    name: profile.product.name,
    description: profile.product.description,
    icons: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      96: 'icon-96.png',
      128: 'icon-128.png',
    },
    permissions: ['storage', 'activeTab'],
    commands: {
      'toggle-pause': {
        suggested_key: {
          default: 'Ctrl+Shift+U',
          mac: 'MacCtrl+Shift+U',
        },
        description: 'Pause or resume Cognitive Comfort',
      },
      'toggle-site': {
        suggested_key: {
          default: 'Ctrl+Shift+O',
          mac: 'MacCtrl+Shift+O',
        },
        description: 'Toggle Cognitive Comfort for the current site',
      },
      'peek-show': {
        suggested_key: {
          default: 'Ctrl+Shift+A',
          mac: 'MacCtrl+Shift+A',
        },
        description: 'Peek: briefly reveal hidden media',
      },
      'toggle-global': {
        suggested_key: {
          default: 'Ctrl+Shift+E',
          mac: 'MacCtrl+Shift+E',
        },
        description: 'Show or hide media on every site',
      },
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: firefoxGeckoSettings,
          },
        }
      : {}),
  },
  zip: {
    includeSources: [
      'config/**',
      'public/icon-*.png',
      'scripts/**',
      'src/**',
      'tests/**',
      'icon_large.png',
      'CONTRIBUTING.md',
      'LICENSE',
      'PRIVACY.md',
      'README.md',
      'SECURITY.md',
      'TRADEMARKS.md',
      'justfile',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'tsconfig.json',
      'vitest.config.ts',
      'wxt.config.ts',
    ],
    // WXT treats includeSources as exceptions to exclusions, so exclude all
    // unmatched files to make the list above an actual allowlist.
    excludeSources: ['**/*'],
  },
  webExt: {
    startUrls: ['https://en.wikipedia.org/wiki/Main_Page'],
    openDevtools: true,
    binaries,
    ...(isChromium && {
      chromiumArgs: [
        `--remote-debugging-port=${debugPort}`,
        `--user-data-dir=./.wxt/${browser}-data`,
      ],
    }),
    ...(!isChromium && {
      firefoxArgs: ['-start-debugger-server', `${debugPort}`],
    }),
  },
});
