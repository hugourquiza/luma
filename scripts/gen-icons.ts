#!/usr/bin/env node
// Generate PWA icons (192 & 512 PNG) and apple-touch icon (180).
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve(process.cwd(), 'public/images');
mkdirSync(OUT, { recursive: true });

const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="${size}" height="${size}">
  <rect width="200" height="200" rx="40" fill="#FFF7E6"/>
  <circle cx="100" cy="100" r="78" fill="#B3E5FC"/>
  <path d="M100 70 C 88 100, 88 130, 100 150" stroke="#7CB342" stroke-width="8" fill="none"/>
  <circle cx="100" cy="95" r="26" fill="#FFD54F"/>
  <circle cx="100" cy="95" r="14" fill="#FF6F61"/>
  <line x1="78" y1="80" x2="86" y2="86" stroke="#FFD54F" stroke-width="3"/>
</svg>
`;

const tasks = [['icon-192', 192], ['icon-512', 512], ['apple-touch-icon', 180]];

function raster() {
  for (const [name, size] of tasks) {
    writeFileSync(resolve(OUT, `_${name}.svg`), svg(size));
  }
  // Use macOS `sips` (available on all Macs) to rasterize SVG → PNG.
  try {
    for (const [name] of tasks) {
      const src = resolve(OUT, `_${name}.svg`);
      const dst = resolve(OUT, `${name === 'apple-touch-icon' ? 'apple-touch-icon' : name}.png`);
      execSync(`sips -s format png "${src}" --out "${dst}"`, { stdio: ['ignore', 'ignore', 'ignore'] });
    }
    console.log('icons: generated with sips');
  } catch (e) {
    console.log('sips unavailable; icons left as SVG, PNG pending', String(e));
  }
}
raster();
