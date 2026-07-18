import fs from 'node:fs';
import path from 'node:path';

for (const target of ['.output', '.wxt', 'node_modules/.wxt']) {
  fs.rmSync(path.resolve(target), { recursive: true, force: true });
}
