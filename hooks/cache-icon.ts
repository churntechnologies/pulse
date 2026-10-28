// The cache's own little icon beside WARM and COLD: a flickering flame while it
// is warm, one burning low in amber as it is about to go, and a twinkling
// snowflake once it is cold. Pure and fixed per state, animated in CSS like Pip.

export type Heat = 'warm' | 'closing' | 'cold'

/** CSS pixels, square. */
export const ICON_SIZE = 16

const FLAME = '#e0703f'
const CORE = '#f6b25a'
const EMBER = '#e8a33d'
const EMBER_CORE = '#f7d58a'
const ICE = '#6aa0d8'
const ICE_TIP = '#a9cdf0'

const r = (x: number, y: number, w: number, h: number, fill: string) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`

/** A pixel flame on an 8 by 10 grid, standing on its base. */
const flame = (outer: string, inner: string) =>
  '<g class="flame">' +
  r(3, 0, 1, 1, outer) + r(3, 1, 2, 1, outer) + r(2, 2, 3, 1, outer) + r(2, 3, 4, 1, outer) +
  r(1, 4, 5, 1, outer) + r(1, 5, 6, 3, outer) + r(2, 8, 4, 1, outer) + r(3, 9, 2, 1, outer) +
  `<g class="core">${r(3, 5, 2, 1, inner)}${r(3, 6, 2, 2, inner)}${r(3, 8, 2, 1, inner)}</g>` +
  '</g>'

/** A pixel snowflake on a 9 by 9 grid, set one row down to sit with the flame. */
const snowflake =
  '<g class="flake">' +
  r(4, 1, 1, 9, ICE) + r(0, 5, 9, 1, ICE) +
  r(2, 3, 1, 1, ICE) + r(6, 3, 1, 1, ICE) + r(2, 7, 1, 1, ICE) + r(6, 7, 1, 1, ICE) +
  `<g class="tips">${r(1, 2, 1, 1, ICE_TIP)}${r(7, 2, 1, 1, ICE_TIP)}${r(1, 8, 1, 1, ICE_TIP)}${r(7, 8, 1, 1, ICE_TIP)}</g>` +
  '</g>'

const MOTION: Record<Heat, string> = {
  warm: '.flame{animation:flicker .9s steps(3) infinite}.core{animation:glow .6s ease-in-out infinite alternate}',
  closing: '.flame{animation:gutter 1.6s ease-in-out infinite}.core{animation:glow 1.2s ease-in-out infinite alternate}',
  cold: '.flake{animation:breathe 3.2s ease-in-out infinite}.tips{animation:twinkle 1.6s ease-in-out infinite alternate}',
}

const KEYFRAMES =
  '@keyframes flicker{0%{transform:scaleY(1) skewX(0)}33%{transform:scaleY(1.08) skewX(-5deg)}66%{transform:scaleY(.95) skewX(4deg)}}' +
  '@keyframes gutter{0%,100%{transform:scale(.8);opacity:.85}50%{transform:scale(.68);opacity:.55}}' +
  '@keyframes glow{from{opacity:.7}to{opacity:1}}' +
  '@keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(.9)}}' +
  '@keyframes twinkle{from{opacity:.2}to{opacity:1}}'

export const cacheIconSvg = (heat: Heat): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="-0.5 0 10 10" shape-rendering="crispEdges">` +
  '<style>g{transform-box:fill-box;transform-origin:center bottom}.flake,.tips{transform-origin:center}' +
  MOTION[heat] +
  KEYFRAMES +
  '@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>' +
  (heat === 'cold' ? snowflake : heat === 'closing' ? flame(EMBER, EMBER_CORE) : flame(FLAME, CORE)) +
  '</svg>'
