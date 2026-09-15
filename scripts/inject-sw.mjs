#!/usr/bin/env node
// Build step: generate dist/sw.js with the real shell precache list and a
// version, so offline navigation and shell serving stay coherent (§11).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

const dist = resolve(process.cwd(), 'dist');
const publicDir = resolve(process.cwd(), 'public');
const swSrc = resolve(publicDir, 'sw.js');

if (!existsSync(swSrc)) { console.error('sw.js no encontrado'); process.exit(1); }
if (!existsSync(dist)) { console.error('dist/ no existe; corré vite build primero'); process.exit(1); }

// collect shell assets under dist/assets + index.html + manifest + icons
function collect(dir) {
  const files = [];
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) files.push(...collect(full));
    else files.push(full);
  }
  return files;
}

const all = collect(dist);
const shell = all
  .map((f) => './' + relative(dist, f).replace(/\\/g, '/'))
  .filter((p) =>
    p === './index.html' ||
    p.startsWith('./assets/') ||
    p === './manifest.webmanifest' ||
    p === './favicon.ico' ||
    /\.(png|svg)$/.test(p) && p.startsWith('./images/icon') ||
    p === './images/apple-touch-icon.png'
  );

// version = git-ish short hash of the shell list
const hash = createHash('sha1').update(JSON.stringify(shell)).digest('hex').slice(0, 10);
const swVersion = `v${Date.now().toString(36)}-${hash}`;

let src = readFileSync(swSrc, 'utf8');
// Replace the placeholder line with the real version + precache list.
src = src.replace(
  /self\.__SHELL_FILES__ = \[.*?\];/s,
  `self.__SHELL_FILES__ = ${JSON.stringify(shell)};`,
);
src = src.replace(
  /self\.__SHELL_VERSION__ = '.*?';/,
  `self.__SHELL_VERSION__ = '${swVersion}';`,
);

writeFileSync(resolve(dist, 'sw.js'), src);
console.log(`sw.js: precache ${shell.length} shell files (version ${swVersion})`);
