// Pip, the band's little critter: a pixel blob in Claude's coral with a spark on
// its head. Pure: each mood is one fixed SVG string, so a redraw that keeps the
// mood hands the surface the same drawing and nothing reloads.
//
// It moves with CSS keyframes inside the drawing, which the surface plays on
// its own: no frames are pushed and no hook runs while it moves. A viewer who
// asks for reduced motion gets it standing still.

export type Mood = 'idle' | 'working' | 'drowsy' | 'asleep' | 'alert' | 'hop' | 'wobble'

/** CSS pixels, square. */
export const PIP_SIZE = 22

const CORAL = '#d97757'
const SLEEPY = '#b9927f'
const INK = '#2a1a14'
const SPARK = '#f0b48f'
const ZZZ = '#7fa7bd'
const AMBER = '#e8a33d'
const SWEAT = '#8fc3e0'

const MOTION: Record<Mood, string> = {
  idle:
    '.bob{animation:bob 2.6s ease-in-out infinite}' +
    '.look{animation:look 10s ease-in-out infinite}' +
    '.blink{animation:blink 4.6s infinite}' +
    '.spark{animation:twinkle 3s ease-in-out infinite}',
  working:
    '.bob{animation:bob .55s ease-in-out infinite}' +
    '.arm-l{animation:wave .55s ease-in-out infinite}' +
    '.arm-r{animation:wave .55s ease-in-out .27s infinite}' +
    '.blink{animation:blink 3.2s infinite}' +
    '.spark{animation:spin 1.2s linear infinite}',
  drowsy:
    '.bob{animation:breathe 3.6s ease-in-out infinite}' +
    '.yawn{animation:yawn 6s ease-in-out infinite}',
  asleep:
    '.bob{animation:breathe 4s ease-in-out infinite}' +
    '.z1{animation:drift 3.2s ease-out infinite}' +
    '.z2{animation:drift 3.2s ease-out 1.6s infinite}',
  alert:
    '.bob{animation:bob .9s ease-in-out infinite}' +
    '.mark{animation:flash 1s steps(1) infinite}',
  hop:
    '.bob{animation:hop .7s ease-out 3}' +
    '.spark{animation:twinkle .35s ease-in-out 6}',
  wobble:
    '.bob{animation:wobble .3s ease-in-out 6}' +
    '.drop{animation:drip 1.8s ease-in 1 forwards}',
}

const KEYFRAMES =
  '@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-1px)}}' +
  '@keyframes breathe{0%,100%{transform:scaleY(1)}50%{transform:scaleY(.94)}}' +
  '@keyframes look{0%,35%,100%{transform:translateX(0)}42%,55%{transform:translateX(1px)}62%,75%{transform:translateX(-1px)}}' +
  '@keyframes blink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.15)}}' +
  '@keyframes wave{0%,100%{transform:translateY(0)}50%{transform:translateY(-1px)}}' +
  '@keyframes twinkle{0%,100%{opacity:.55;transform:scale(.8)}50%{opacity:1;transform:scale(1.1)}}' +
  '@keyframes spin{to{transform:rotate(90deg)}}' +
  '@keyframes drift{0%{opacity:0;transform:translate(0,0)}20%{opacity:1}100%{opacity:0;transform:translate(1px,-1px)}}' +
  '@keyframes yawn{0%,70%,100%{transform:scaleY(0)}78%,90%{transform:scaleY(1)}}' +
  '@keyframes flash{0%{opacity:1}50%{opacity:.25}}' +
  '@keyframes hop{0%,100%{transform:translateY(0)}40%{transform:translateY(-3px)}}' +
  '@keyframes wobble{0%,100%{transform:rotate(0)}25%{transform:rotate(-9deg)}75%{transform:rotate(9deg)}}' +
  '@keyframes drip{0%{opacity:0;transform:translateY(0)}20%{opacity:1}100%{opacity:0;transform:translateY(3px)}}'

const r = (x: number, y: number, w: number, h: number, fill: string, cls = '') =>
  `<rect${cls ? ` class="${cls}"` : ''} x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`

/** A five-pixel z, its top-left corner at x, y. */
const zee = (x: number, y: number, cls: string) =>
  `<g class="${cls}" opacity="0">` +
  r(x, y, 5, 1, ZZZ) + r(x + 3, y + 1, 1, 1, ZZZ) + r(x + 2, y + 2, 1, 1, ZZZ) + r(x + 1, y + 3, 1, 1, ZZZ) +
  r(x, y + 4, 5, 1, ZZZ) +
  '</g>'

const EYES: Record<Mood, string> = {
  idle: `<g class="look"><g class="blink">${r(5, 6, 1, 2, INK)}${r(10, 6, 1, 2, INK)}</g></g>`,
  working: `<g class="blink">${r(5, 6, 1, 2, INK)}${r(10, 6, 1, 2, INK)}</g>`,
  // Half-shut eyes and a yawn now and then.
  drowsy: r(5, 7, 1, 1, INK) + r(10, 7, 1, 1, INK) + `<g class="yawn">${r(7, 8, 2, 2, INK)}</g>`,
  asleep: r(5, 7, 2, 1, INK) + r(9, 7, 2, 1, INK),
  // Wide eyes.
  alert: r(5, 5, 2, 2, INK) + r(9, 5, 2, 2, INK),
  // Happy ^ ^ eyes.
  hop: r(5, 6, 1, 1, INK) + r(4, 7, 1, 1, INK) + r(6, 7, 1, 1, INK) + r(10, 6, 1, 1, INK) + r(9, 7, 1, 1, INK) + r(11, 7, 1, 1, INK),
  // Squeezed > < eyes.
  wobble: r(5, 6, 1, 1, INK) + r(6, 7, 1, 1, INK) + r(5, 8, 1, 1, INK) + r(10, 6, 1, 1, INK) + r(9, 7, 1, 1, INK) + r(10, 8, 1, 1, INK),
}

export const pipSvg = (mood: Mood): string => {
  const sleepy = mood === 'asleep' || mood === 'drowsy'
  const body = mood === 'asleep' ? SLEEPY : CORAL
  const armsUp = mood === 'hop' || mood === 'alert'
  const spark =
    `<path class="spark" d="M8 0.2L8.6 1.4L9.8 2L8.6 2.6L8 3.8L7.4 2.6L6.2 2L7.4 1.4Z" fill="${SPARK}"` +
    ` opacity="${sleepy ? 0.35 : 0.8}" shape-rendering="auto"/>`
  let extra = ''
  if (mood === 'asleep') extra = zee(13, -2, 'z1') + zee(13, -2, 'z2')
  if (mood === 'alert') extra = `<g class="mark">${r(16, -2, 1, 4, AMBER)}${r(16, 3, 1, 1, AMBER)}</g>`
  if (mood === 'wobble') extra = `<g class="drop" opacity="0">${r(15, 2, 1, 1, SWEAT)}${r(14, 3, 3, 2, SWEAT)}</g>`

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PIP_SIZE}" height="${PIP_SIZE}" viewBox="0 -3 19 19" shape-rendering="crispEdges">` +
    '<style>g,rect,path{transform-box:fill-box;transform-origin:center}' +
    '.bob{transform-origin:center bottom}' +
    MOTION[mood] +
    KEYFRAMES +
    '@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>' +
    '<g class="bob">' +
    spark +
    r(4, 3, 8, 1, body) +
    r(3, 4, 10, 7, body) +
    `<g class="arm-l">${r(1, armsUp ? 4 : 6, 2, 2, body)}</g>` +
    `<g class="arm-r">${r(13, armsUp ? 4 : 6, 2, 2, body)}</g>` +
    r(5, 11, 2, 2, body) +
    r(9, 11, 2, 2, body) +
    EYES[mood] +
    '</g>' +
    extra +
    '</svg>'
  )
}
