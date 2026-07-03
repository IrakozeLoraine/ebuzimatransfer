/*
 * Stamp the built service worker with a unique CACHE_VERSION.
 *
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const swPath = resolve(here, '..', 'dist', 'sw.js');

if (!existsSync(swPath)) {
  console.error(`[stamp-sw] ${swPath} not found — did the build run first?`);
  process.exit(1);
}

// Prefer the git short SHA (stable, traceable); fall back to a timestamp.
let buildId;
try {
  buildId = execSync('git rev-parse --short HEAD', {
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString()
    .trim();
} catch {
  buildId = '';
}
// Always append a timestamp so rebuilds of the same commit still differ.
const version = `${buildId ? buildId + '-' : ''}${Date.now().toString(36)}`;

const src = readFileSync(swPath, 'utf8');
if (!src.includes('__SW_VERSION__')) {
  console.error(
    '[stamp-sw] placeholder __SW_VERSION__ not found in dist/sw.js',
  );
  process.exit(1);
}
writeFileSync(swPath, src.replaceAll('__SW_VERSION__', version));
console.log(`[stamp-sw] CACHE_VERSION = ${version}`);
