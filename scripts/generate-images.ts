#!/usr/bin/env node
// Generates coherent flat-childbook SVG illustrations for content imageIds (§7).
// Book style: cream background, coral/green/turquoise accents, soft edges.
// Each pictogram must be recognisable; alt text = the word meaning.

import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const OUT = resolve(process.cwd(), 'public/images');
mkdirSync(OUT, { recursive: true });

const PAL = {
  cream: '#FFF7E6',
  coral: '#FF6F61',
  coralDark: '#E55B4D',
  green: '#7CB342',
  greenDark: '#5E8430',
  turq: '#26C6DA',
  turqDark: '#1A9FB2',
  sun: '#FFD54F',
  sand: '#E8D5A8',
  sky: '#B3E5FC',
  brown: '#8D6E63',
  white: '#FFFFFF',
  ink: '#3E2723',
  lilac: '#CE93D8',
};

const svg = (id, inner, view = '0 0 200 200') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}" width="200" height="200" role="img" aria-label="${id}">
  <rect width="200" height="200" rx="24" fill="${PAL.cream}"/>
  ${inner}
</svg>
`;

const CIRCLE = () => '<circle cx="100" cy="110" r="80" fill="#D7CCC8" opacity="0.3"/>';

const ART = {
  ala: () => svg('un ala', `${CIRCLE()}
    <path d="M40 150 C 70 90, 130 90, 160 150 Z" fill="${PAL.coral}"/>
    <path d="M40 150 C 70 104, 130 104, 160 150" fill="none" stroke="${PAL.coralDark}" stroke-width="4"/>
    <line x1="60" y1="140" x2="60" y2="118" stroke="${PAL.white}" stroke-width="5" stroke-linecap="round"/>
    <line x1="100" y1="144" x2="100" y2="118" stroke="${PAL.white}" stroke-width="5" stroke-linecap="round"/>
    <line x1="140" y1="140" x2="140" y2="122" stroke="${PAL.white}" stroke-width="5" stroke-linecap="round"/>
  `),
  boca: () => svg('una boca', `${CIRCLE()}
    <ellipse cx="100" cy="120" rx="60" ry="38" fill="${PAL.coral}"/>
    <ellipse cx="100" cy="132" rx="50" ry="26" fill="#FF8A80"/>
    <rect x="72" y="108" width="56" height="8" rx="4" fill="${PAL.white}"/>
  `),
  dado: () => svg('un dado', `${CIRCLE()}
    <rect x="60" y="50" width="80" height="80" rx="14" fill="${PAL.white}" stroke="${PAL.ink}" stroke-width="4"/>
    <circle cx="80" cy="70" r="8" fill="${PAL.coral}"/><circle cx="120" cy="110" r="8" fill="${PAL.coral}"/>
    <circle cx="100" cy="60" r="8" fill="${PAL.turq}"/>
  `),
  ele: () => svg('una elefante, el ele', `${CIRCLE()}
    <ellipse cx="100" cy="120" rx="55" ry="48" fill="#90A4AE"/>
    <ellipse cx="100" cy="120" rx="28" ry="26" fill="#B0BEC5"/>
    <circle cx="85" cy="105" r="6" fill="${PAL.ink}"/><circle cx="115" cy="105" r="6" fill="${PAL.ink}"/>
    <path d="M100 118 Q 130 130 118 165" fill="#90A4AE" stroke="#90A4AE" stroke-width="10" stroke-linecap="round"/>
  `),
  foto: () => svg('una foto', `${CIRCLE()}
    <rect x="50" y="45" width="100" height="90" rx="8" fill="${PAL.white}" stroke="${PAL.brown}" stroke-width="4"/>
    <circle cx="90" cy="80" r="14" fill="${PAL.sun}"/><path d="M50 130 L90 100 L110 118 L130 95 L150 130" fill="${PAL.green}"/>
  `),
  leche: () => svg('una leche', `${CIRCLE()}
    <rect x="70" y="60" width="60" height="80" rx="8" fill="${PAL.white}" stroke="${PAL.ink}" stroke-width="4"/>
    <path d="M70 80 L100 55 L130 80" fill="none" stroke="${PAL.ink}" stroke-width="5"/>
    <text x="100" y="115" text-anchor="middle" font-family="sans-serif" font-size="26" fill="${PAL.turq}" font-weight="bold">L</text>
  `),
  luna: () => svg('una luna', `${CIRCLE()}
    <path d="M135 60 A 62 62 0 1 0 138 145 A 50 50 0 1 1 135 60 Z" fill="${PAL.sun}"/>
    <circle cx="40" cy="45" r="4" fill="${PAL.sun}"/><circle cx="60" cy="160" r="3" fill="${PAL.sun}"/><circle cx="170" cy="40" r="3" fill="${PAL.sun}"/>
  `),
  lupa: () => svg('una lupa', `${CIRCLE()}
    <circle cx="85" cy="95" r="45" fill="${PAL.turq}" fill-opacity="0.35" stroke="${PAL.brown}" stroke-width="6"/>
    <circle cx="85" cy="95" r="45" fill="none" stroke="${PAL.brown}" stroke-width="6"/>
    <line x1="120" y1="130" x2="160" y2="170" stroke="${PAL.brown}" stroke-width="10" stroke-linecap="round"/>
    <circle cx="100" cy="110" r="10" fill="${PAL.sun}"/>
  `),
  mapa: () => svg('un mapa', `${CIRCLE()}
    <rect x="45" y="40" width="110" height="70" rx="6" fill="${PAL.sand}" stroke="${PAL.brown}" stroke-width="4"/>
    <path d="M60 55 L120 85" stroke="${PAL.greenDark}" stroke-width="4" stroke-dasharray="6 4"/>
    <circle cx="130" cy="65" r="6" fill="${PAL.coral}"/>
    <text x="100" y="150" text-anchor="middle" font-size="22" fill="${PAL.ink}">Mapa</text>
  `),
  mesa: () => svg('una mesa', `${CIRCLE()}
    <rect x="40" y="90" width="120" height="14" rx="5" fill="${PAL.brown}"/>
    <rect x="62" y="104" width="12" height="50" fill="${PAL.brown}"/>
    <rect x="126" y="104" width="12" height="50" fill="${PAL.brown}"/>
    <rect x="58" y="70" width="84" height="22" rx="6" fill="${PAL.turq}" fill-opacity="0.6" stroke="${PAL.turqDark}" stroke-width="3"/>
    <text x="100" y="87" text-anchor="middle" font-size="16" fill="${PAL.ink}">mesa</text>
  `),
  nata: () => svg('una nata / crema', `${CIRCLE()}
    <ellipse cx="100" cy="120" rx="62" ry="30" fill="${PAL.lilac}" opacity="0.5"/>
    <path d="M55 105 C 62 50, 138 50, 145 105 Z" fill="${PAL.lilac}" opacity="0.7"/>
  `),
  ojo: () => svg('un ojo', `${CIRCLE()}
    <ellipse cx="100" cy="110" rx="65" ry="40" fill="${PAL.white}" stroke="${PAL.ink}" stroke-width="4"/>
    <circle cx="100" cy="115" r="26" fill="${PAL.turq}"/>
    <circle cx="100" cy="115" r="12" fill="${PAL.ink}"/>
    <circle cx="108" cy="106" r="4" fill="${PAL.white}"/>
  `),
  ola: () => svg('una ola', `${CIRCLE()}
    <path d="M20 120 Q 55 85 90 120 T 160 120 T 190 120" fill="none" stroke="${PAL.turq}" stroke-width="0"/>
    <path d="M20 140 Q 60 95 100 140 T 180 140" fill="none" stroke="${PAL.turqDark}" stroke-width="18" stroke-linecap="round"/>
    <path d="M40 110 Q 75 70 110 110 T 175 110" fill="none" stroke="${PAL.turq}" stroke-width="14" stroke-linecap="round"/>
  `),
  oso: () => svg('un oso', `${CIRCLE()}
    <circle cx="100" cy="120" r="52" fill="${PAL.brown}"/>
    <circle cx="62" cy="85" r="20" fill="${PAL.brown}"/><circle cx="138" cy="85" r="20" fill="${PAL.brown}"/>
    <circle cx="85" cy="110" r="6" fill="${PAL.ink}"/><circle cx="115" cy="110" r="6" fill="${PAL.ink}"/>
    <ellipse cx="100" cy="128" rx="12" ry="8" fill="${PAL.ink}"/>
  `),
  pala: () => svg('una pala', `${CIRCLE()}
    <rect x="94" y="40" width="12" height="80" rx="5" fill="${PAL.brown}"/>
    <path d="M55 150 L95 118 L145 118 L105 150 A 25 25 0 0 1 55 150 Z" fill="${PAL.turq}" stroke="${PAL.turqDark}" stroke-width="4"/>
  `),
  pan: () => svg('un pan', `${CIRCLE()}
    <path d="M55 145 A 45 45 0 0 1 145 145 Z" fill="${PAL.sun}" stroke="${PAL.brown}" stroke-width="4"/>
    <line x1="70" y1="130" x2="130" y2="130" stroke="${PAL.brown}" stroke-width="4"/>
  `),
  pato: () => svg('un pato', `${CIRCLE()}
    <ellipse cx="100" cy="135" rx="45" ry="30" fill="${PAL.sun}"/>
    <circle cx="140" cy="108" r="22" fill="${PAL.sun}"/>
    <ellipse cx="160" cy="116" rx="16" ry="10" fill="${PAL.coral}"/>
    <circle cx="147" cy="102" r="4" fill="${PAL.ink}"/>
  `),
  pera: () => svg('una pera', `${CIRCLE()}
    <circle cx="110" cy="120" r="40" fill="${PAL.green}"/>
    <path d="M100 85 Q 110 55 108 40" fill="none" stroke="${PAL.brown}" stroke-width="6"/>
    <ellipse cx="96" cy="130" rx="12" ry="18" fill="${PAL.greenDark}"/>
  `),
  perro: () => svg('un perro', `${CIRCLE()}
    <ellipse cx="100" cy="130" rx="48" ry="38" fill="${PAL.brown}" fill-opacity="0.8"/>
    <path d="M70 100 L60 60 L90 100 Z" fill="${PAL.brown}"/>
    <path d="M130 100 L140 60 L110 100 Z" fill="${PAL.brown}"/>
    <circle cx="140" cy="105" r="18" fill="${PAL.brown}"/>
    <circle cx="146" cy="100" r="4" fill="${PAL.ink}"/><circle cx="133" cy="100" r="4" fill="${PAL.ink}"/>
    <ellipse cx="100" cy="140" rx="10" ry="6" fill="${PAL.ink}"/>
  `),
  queso: () => svg('un queso', `${CIRCLE()}
    <path d="M40 100 L100 55 L160 100 L160 140 L40 140 Z" fill="${PAL.sun}"/>
    <circle cx="100" cy="110" r="8" fill="${PAL.coral}"/><circle cx="130" cy="110" r="6" fill="${PAL.coral}"/><circle cx="70" cy="118" r="6" fill="${PAL.coral}"/>
  `),
  sala: () => svg('una sala', `${CIRCLE()}
    <path d="M30 120 L50 95 L150 95 L170 120 Z" fill="${PAL.brown}"/><path d="M30 120 L170 120 L170 135 L30 135 Z" fill="${PAL.sand}"/>
    <rect x="70" y="90" width="60" height="30" rx="5" fill="${PAL.turq}"/>
  `),
  sapo: () => svg('un sapo', `${CIRCLE()}
    <ellipse cx="100" cy="130" rx="55" ry="40" fill="${PAL.green}"/>
    <circle cx="72" cy="95" r="14" fill="${PAL.green}"/><circle cx="128" cy="95" r="14" fill="${PAL.green}"/>
    <circle cx="78" cy="95" r="5" fill="${PAL.ink}"/><circle cx="122" cy="95" r="5" fill="${PAL.ink}"/>
  `),
  sol: () => svg('un sol', `${CIRCLE()}
    <circle cx="100" cy="110" r="42" fill="${PAL.sun}"/>
    <g stroke="${PAL.sun}" stroke-width="10" stroke-linecap="round">
      <line x1="100" y1="45" x2="100" y2="25"/><line x1="100" y1="175" x2="100" y2="195"/>
      <line x1="35" y1="110" x2="15" y2="110"/><line x1="165" y1="110" x2="185" y2="110"/>
    </g>
  `),
  sopa: () => svg('una sopa', `${CIRCLE()}
    <path d="M40 110 Q 60 60 100 60 Q 140 60 160 110 Q 160 140 100 140 Q 40 140 40 110 Z" fill="${PAL.turq}" fill-opacity="0.5"/>
    <circle cx="85" cy="100" r="6" fill="${PAL.coral}"/><circle cx="115" cy="108" r="5" fill="${PAL.coral}"/><circle cx="100" cy="125" r="4" fill="${PAL.green}"/>
    <path d="M55 140 Q 100 165 145 140" fill="none" stroke="${PAL.turqDark}" stroke-width="8" stroke-linecap="round"/>
  `),
  suma: () => svg('una suma', `${CIRCLE()}
    <text x="100" y="90" text-anchor="middle" font-size="64" font-weight="bold" fill="${PAL.coral}">1+1</text>
    <rect x="82" y="115" width="36" height="8" rx="4" fill="${PAL.sun}"/>
  `),
  tela: () => svg('una tela', `${CIRCLE()}
    <path d="M50 40 L100 25 L150 40 L150 160 L50 160 Z" fill="${PAL.lilac}" opacity="0.4"/>
    <path d="M55 45 L145 45 L135 160 L65 160 Z" fill="${PAL.lilac}" opacity="0.7"/>
    <path d="M50 40 L130 160 M150 40 L70 160" stroke="${PAL.ink}" stroke-width="3" opacity="0.5"/>
  `),
  una: () => svg('uno, el número uno', `${CIRCLE()}
    <text x="100" y="140" text-anchor="middle" font-size="90" font-weight="bold" fill="${PAL.coral}">1</text>
  `),
  uva: () => svg('una uva', `${CIRCLE()}
    <circle cx="85" cy="120" r="22" fill="${PAL.lilac}"/><circle cx="115" cy="120" r="22" fill="${PAL.lilac}"/><circle cx="100" cy="145" r="22" fill="${PAL.lilac}"/>
    <path d="M95 95 L85 60" stroke="${PAL.greenDark}" stroke-width="5"/>
  `),
  rama: () => svg('una rama', `${CIRCLE()}
    <path d="M100 180 L100 90" stroke="${PAL.brown}" stroke-width="10" stroke-linecap="round"/>
    <path d="M100 120 L70 90 M100 110 L130 80 M100 145 L75 130 M100 135 L128 120" stroke="${PAL.brown}" stroke-width="7" stroke-linecap="round"/>
    <circle cx="68" cy="86" r="14" fill="${PAL.green}"/><circle cx="132" cy="76" r="13" fill="${PAL.green}"/><circle cx="73" cy="128" r="12" fill="${PAL.green}"/><circle cx="130" cy="116" r="11" fill="${PAL.green}"/>
  `),
  uno: () => svg('uno, el número uno', `${CIRCLE()}
    <text x="100" y="140" text-anchor="middle" font-size="90" font-weight="bold" fill="${PAL.coral}">1</text>
  `),
  vaca: () => svg('una vaca', `${CIRCLE()}
    <ellipse cx="100" cy="135" rx="52" ry="34" fill="${PAL.white}" stroke="${PAL.ink}" stroke-width="3"/>
    <ellipse cx="110" cy="120" rx="18" ry="26" fill="${PAL.white}" stroke="${PAL.ink}" stroke-width="3"/>
    <circle cx="112" cy="108" r="4" fill="${PAL.ink}"/>
    <path d="M140 110 L145 90 M135 110 L138 95" stroke="${PAL.brown}" stroke-width="4" stroke-linecap="round"/>
    <path d="M60 120 L50 100 M70 120 L72 100" stroke="${PAL.brown}" stroke-width="4" stroke-linecap="round"/>
  `),
  baño: () => svg('un baño / ducha', `${CIRCLE()}
    <rect x="55" y="100" width="90" height="60" rx="8" fill="${PAL.turq}" fill-opacity="0.4" stroke="${PAL.turqDark}" stroke-width="4"/>
    <path d="M100 100 L100 55" stroke="${PAL.brown}" stroke-width="8"/>
    <circle cx="100" cy="40" r="14" fill="${PAL.turq}"/>
    <path d="M75 90 L125 90 M85 65 L115 65" stroke="${PAL.turqDark}" stroke-width="5" stroke-linecap="round"/>
  `),
};

const words = readdirSync(resolve(process.cwd(), 'public/content'))
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .flatMap((f) => JSON.parse(readFileSync(join(resolve(process.cwd(), 'public/content'), f), 'utf8')).lessons)
  .flatMap((l) => l.activities)
  .flatMap((a) => [a.imageId, ...(a.choices ?? []).map((c) => c.imageId)].filter(Boolean));

const unique = [...new Set(words)];
let ok = 0, missing = 0;
for (const w of unique) {
  const draw = ART[w];
  const full = resolve(OUT, `${w}.svg`);
  if (draw) {
    writeFileSync(full, draw());
    ok++;
  } else {
    // generic placeholder fallback with the word
    writeFileSync(full, svg(w, `<text x="100" y="120" text-anchor="middle" font-family="sans-serif" font-size="34" font-weight="bold" fill="${PAL.ink}">${w}</text>`));
    missing++;
  }
}
console.log(`images: ${ok} illustrated, ${missing} as text-placeholder, ${unique.length} total`);
