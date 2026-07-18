import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import { parse } from 'smol-toml';

const scriptPath = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(scriptPath), '..');

export function getProfileName(inputProfile) {
  return inputProfile || process.env.BUILD_PROFILE || 'local';
}

export function loadProfileConfig(inputProfile) {
  const profileName = getProfileName(inputProfile);
  const profilePath = path.join(rootDir, 'config', 'profiles', `${profileName}.toml`);

  if (!fs.existsSync(profilePath)) {
    throw new Error(`Profile not found: ${profilePath}`);
  }

  const profile = parse(fs.readFileSync(profilePath, 'utf8'));

  return {
    meta: profile.meta,
    product: profile.product,
    defaults: {
      ...profile.defaults,
      // Mirrors SCHEMA_VERSION in src/utils/storage.ts; bumped when the stored
      // settings shape changes so migrate() can transform legacy data.
      schemaVersion: 1,
      siteOverrides: {},
      emojiSiteOverrides: {},
    },
    distribution: profile.distribution,
  };
}

function getByPath(target, dotPath) {
  return dotPath.split('.').reduce((value, key) => value?.[key], target);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(scriptPath)) {
  const [, , maybeProfile, maybePath] = process.argv;
  const hasExplicitPath = typeof maybePath === 'string';
  const profileName = hasExplicitPath ? maybeProfile : undefined;
  const valuePath = hasExplicitPath ? maybePath : maybeProfile;
  const profile = loadProfileConfig(profileName);

  if (!valuePath) {
    process.stdout.write(JSON.stringify(profile));
    process.exit(0);
  }

  const value = getByPath(profile, valuePath);
  if (value === undefined) {
    process.exit(1);
  }

  process.stdout.write(typeof value === 'string' ? value : JSON.stringify(value));
}
