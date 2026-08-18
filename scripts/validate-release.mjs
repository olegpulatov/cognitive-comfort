#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = process.argv[2];
const targets = {
  chrome: { manifestVersion: 3, outputDir: 'chrome-mv3' },
  edge: { manifestVersion: 3, outputDir: 'edge-mv3' },
  firefox: { manifestVersion: 2, outputDir: 'firefox-mv2' },
};
const target = targets[browser];

if (!target) {
  console.error('Usage: node scripts/validate-release.mjs <chrome|edge|firefox>');
  process.exit(2);
}

function fail(message) {
  throw new Error(`${browser}: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`cannot read ${path.relative(rootDir, filePath)}: ${error.message}`);
  }
}

const packageJson = readJson(path.join(rootDir, 'package.json'));
const artifactPath = path.join(
  rootDir,
  '.output',
  `${packageJson.name}-${packageJson.version}-${browser}.zip`,
);
assert(fs.existsSync(artifactPath), `missing release ZIP ${path.relative(rootDir, artifactPath)}`);

let manifest;
try {
  manifest = JSON.parse(execFileSync('unzip', ['-p', artifactPath, 'manifest.json'], { encoding: 'utf8' }));
} catch (error) {
  fail(`cannot read packaged manifest: ${error.message}`);
}

assert(manifest.manifest_version === target.manifestVersion, `expected manifest v${target.manifestVersion}`);
assert(manifest.version === packageJson.version, `manifest version ${manifest.version} != package ${packageJson.version}`);
assert(
  Array.isArray(manifest.permissions)
    && [...manifest.permissions].sort().join('\n') === ['activeTab', 'storage'].sort().join('\n'),
  'permissions must be exactly storage and activeTab',
);
assert(
  Array.isArray(manifest.content_scripts)
    && manifest.content_scripts.length === 1
    && manifest.content_scripts[0].run_at === 'document_start'
    && Array.isArray(manifest.content_scripts[0].matches)
    && manifest.content_scripts[0].matches.length === 1
    && manifest.content_scripts[0].matches[0] === '<all_urls>',
  'content script must match only <all_urls> at document_start',
);

if (browser === 'firefox') {
  assert(Array.isArray(manifest.background?.scripts) && manifest.background.scripts.length > 0, 'background scripts are required');
  assert(!('service_worker' in (manifest.background ?? {})), 'service worker is not valid in the Firefox MV2 package');
  assert(
    manifest.browser_specific_settings?.gecko?.id === 'cognitive-comfort@olegpulatov.github.io',
    'unexpected Gecko extension ID',
  );
  assert(
    manifest.browser_specific_settings?.gecko?.strict_min_version === '140.0',
    'Firefox minimum version must support built-in no-data consent',
  );
  assert(
    manifest.browser_specific_settings?.gecko?.data_collection_permissions?.required?.length === 1
      && manifest.browser_specific_settings.gecko.data_collection_permissions.required[0] === 'none',
    'Firefox data collection permission must declare required none',
  );
} else {
  assert(typeof manifest.background?.service_worker === 'string', 'MV3 service worker is required');
  assert(!('scripts' in (manifest.background ?? {})), 'MV2 background scripts are not valid in an MV3 package');
  assert(!('browser_specific_settings' in manifest) && !('applications' in manifest), 'Gecko metadata is forbidden');
}

const topLevelSources = new Set([
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
]);

function isAllowedSource(sourcePath) {
  if (sourcePath.endsWith('/')) {
    return sourcePath === 'public/'
      || sourcePath === 'brand/'
      || sourcePath === 'brand/icon/'
      || ['config/', 'scripts/', 'src/', 'tests/'].some((prefix) => sourcePath.startsWith(prefix));
  }
  if (topLevelSources.has(sourcePath)) return true;
  if (['config/', 'scripts/', 'src/', 'tests/'].some((prefix) => sourcePath.startsWith(prefix))) return true;
  if (/^brand\/icon\/[^/]+\.svg$/.test(sourcePath)) return true;
  return /^public\/icon-[^/]+\.png$/.test(sourcePath);
}

function isForbiddenSource(sourcePath) {
  const segments = sourcePath.split('/');
  const basename = segments.at(-1) ?? '';
  return segments.some((segment) => /^\.env(?:\.|$)/.test(segment))
    || segments.includes('AGENTS.md')
    || segments.includes('.agent-memory.log')
    || segments.includes('.claude')
    || segments.includes('internal-docs')
    || segments.includes('product')
    || segments.includes('safari')
    || /screenshot/i.test(basename)
    || /^(?:webstore-application\.txt|store-listings\.md)$/i.test(basename)
    || sourcePath.startsWith('/')
    || segments.includes('..');
}

if (browser === 'firefox') {
  const sourcesPath = path.join(rootDir, '.output', `${packageJson.name}-${packageJson.version}-sources.zip`);
  assert(fs.existsSync(sourcesPath), `missing sources ZIP ${path.relative(rootDir, sourcesPath)}`);

  let sourcePaths;
  try {
    sourcePaths = execFileSync('unzip', ['-Z1', sourcesPath], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
  } catch (error) {
    fail(`cannot list sources ZIP: ${error.message}`);
  }

  console.log(`Sources: ${path.relative(rootDir, sourcesPath)}`);
  for (const sourcePath of sourcePaths) {
    console.log(`  ${sourcePath}`);
    assert(!isForbiddenSource(sourcePath), `forbidden source path: ${sourcePath}`);
    assert(isAllowedSource(sourcePath), `source path is outside allowlist: ${sourcePath}`);
  }
}

console.log(`Validated ${path.relative(rootDir, artifactPath)}`);
