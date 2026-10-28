import { expect, mock, test } from 'claude-code/testing'

const STARTED = Date.parse('2098-12-31T20:44:00Z')
const NOW = Date.parse('2098-12-31T22:00:00Z') // 1h 16m after STARTED
const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 4,
  bodyColumns: 140,
  scroll: { offset: 0, bodyRows: 4 },
  view: {},
} as const
const PANE = {
  plugin: 'pulse',
  component: 'Pane',
  requestId: 'pulse',
  surface: 'desktop',
  props: { title: 'Pulse', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const
const SUBSCRIPTION = [
  { kind: 'five_hour', percentUsed: 88, resetsAt: '2098-12-31T23:40:00Z' },
  { kind: 'seven_day', percentUsed: 50 },
]

type Setup = { rateLimits?: unknown[]; percent?: number; toasts?: string[]; opened?: string[] }

const start = async ($: any, on: any, s: Setup = {}) => {
  mock.store(on)
  const clock = mock.clock(on, { now: NOW })
  on('session.start', ($: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.usage', () => ({
    value: {
      startedAt: STARTED,
      context: { window: 200000, tokens: 245000, ...(s.percent !== undefined ? { percent: s.percent } : {}) },
      rateLimits: s.rateLimits ?? SUBSCRIPTION,
      cost: { usd: 2.14 },
    },
  }))
  on('command.register', (_: unknown, e: { name: string }) => ({ value: { command: e.name } }))
  on('classic.SessionStart', () => ({}))
  on('tool.check', () => ({ decision: 'ask' }))
  on('tool.call', () => ({ result: {}, isError: true }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.toast', (_: unknown, e: { text: string }) => {
    s.toasts?.push(e.text)
    return { value: {} }
  })
  on('ui.open', (_: unknown, e: { id: string }) => {
    s.opened?.push(e.id)
    return { value: { isPlaced: true } }
  })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  return clock
}

const resume = ($: any, idleMin: number, tokens = 245000) =>
  $.classic.SessionStart({ source: 'resume', seconds_since_last_response: idleMin * 60, context_tokens: tokens })

const band = ($: any, props: object = PROPS) =>
  $.ui.mount({ plugin: 'pulse', surface: 'desktop', component: 'AbovePrompt', props })

const pip = async (b: any) => (await b.findAll({ type: 'Svg' })).map((s: any) => s.props.alt)

test('five minutes before the cache goes cold the band warns, Pip gets drowsy, and a toast says so', async ($, on) => {
  const toasts: string[] = []
  const clock = await start($, on, { toasts })
  await resume($, 54)

  let b = await band($)
  expect(await b.find({ text: ' 6m left' })).toBeDefined()
  expect(await pip(b)).toEqual(['Pip, idle'])
  await b.unmount()

  await clock.advance(61_000)
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toContain('goes cold in 5m')
  b = await band($)
  expect(await b.find({ text: ' 4m left' })).toBeDefined()
  expect(await pip(b)).toEqual(['Pip, drowsy'])
  await b.unmount()
})

test('the warning toast can be turned off', { options: { coldWarning: false } }, async ($, on) => {
  const toasts: string[] = []
  const clock = await start($, on, { toasts })
  await resume($, 54)
  await clock.advance(61_000)
  expect(toasts).toEqual([])
})

test('a cold cache says how much the next message re-sends', async ($, on) => {
  await start($, on, { rateLimits: [] })
  await resume($, 18)

  const b = await band($)
  expect(await b.find({ text: ' idle 18m · re-sends 245k' })).toBeDefined()
  await b.unmount()
})

test('a usage window shows only once it runs low, with its reset', async ($, on) => {
  await start($, on)

  const b = await band($)
  expect(await b.find({ text: '5H ' })).toBeDefined()
  expect(await b.find({ text: '12% left' })).toBeDefined()
  expect(await b.find({ text: ' · resets 1h 40m' })).toBeDefined()
  expect(await b.find({ text: '7D ' })).toBeUndefined()
  await b.unmount()
})

test('the context fill shows from 60%', async ($, on) => {
  await start($, on, { percent: 72 })
  const b = await band($)
  expect(await b.find({ text: '72%' })).toBeDefined()
  await b.unmount()
})

test('below 60% the context fill stays out of the way', async ($, on) => {
  await start($, on, { percent: 40 })
  const b = await band($)
  expect(await b.find({ text: 'ctx ' })).toBeUndefined()
  await b.unmount()
})

test('the band shows the spend rate, and the budget when one is set', { options: { budget: 2.5 } }, async ($, on) => {
  await start($, on)
  const b = await band($)
  expect(await b.find({ text: ' / $2.50' })).toBeDefined()
  expect(await b.find({ text: ' · $1.69/h' })).toBeDefined()
  // $2.14 of $2.50 is past 80%: the cost turns amber.
  expect((await b.find({ type: 'Text', text: '$2.14' }))?.props.color).toBe('warning')
  await b.unmount()
})

test('Pip looks up while a permission is asked', async ($, on) => {
  await start($, on)
  await $.tool.check({ tool: 'Bash', input: { command: 'rm -rf build' } })
  const b = await band($)
  expect(await pip(b)).toEqual(['Pip, alert'])
  await b.unmount()
})

test('Pip wobbles when a tool fails, and settles after', async ($, on) => {
  const clock = await start($, on)
  // Typed loosely: the per-tool overloads of $.tool.call run past the compiler's depth here.
  await ($ as unknown as { tool: { call: (call: object) => Promise<unknown> } }).tool.call({ tool: 'Bash', command: 'false' })
  let b = await band($)
  expect(await pip(b)).toEqual(['Pip, wobble'])
  await b.unmount()

  await clock.advance(3_000)
  b = await band($)
  expect(await pip(b)).toEqual(['Pip, idle'])
  await b.unmount()
})

test('Pip hops when a long turn finishes', async ($, on) => {
  await start($, on)
  await $.turn.complete({ answer: 'done', durationMs: 90_000, isAborted: false, turnId: 't1', reason: 'answer' })
  const b = await band($)
  expect(await pip(b)).toEqual(['Pip, hop'])
  await b.unmount()
})

test('Details opens the pane, which lays out cost, cache, context, limits and turns', async ($, on) => {
  const opened: string[] = []
  await start($, on, { opened, percent: 72 })
  await resume($, 18)

  const b = await band($)
  await b.press({ key: 'pulse-details' })
  expect(opened).toEqual(['pulse'])
  await b.unmount()

  const pane = await $.ui.mount(PANE)
  for (const text of ['SESSION', 'PROMPT CACHE', 'CONTEXT', 'USAGE LIMITS', 'RECENT TURNS']) {
    expect(await pane.find({ text })).toBeDefined()
  }
  expect(await pane.find({ text: 'WARM · cold in 42m' })).toBeDefined()
  expect(await pane.find({ text: '1 hour (subscription)' })).toBeDefined()
  expect(await pane.find({ text: '72% of 200k' })).toBeDefined()
  expect(await pane.find({ text: '12% left · resets 1h 40m' })).toBeDefined()
  await pane.unmount()
})

test('/pulse opens the pane too', async ($, on) => {
  const opened: string[] = []
  await start($, on, { opened })
  const r = await $.command.run({ command: 'pulse', args: '' } as any)
  expect(opened).toEqual(['pulse'])
  expect(r.text).toBe('Pulse details opened.')
})
