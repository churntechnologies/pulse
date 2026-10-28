import { expect, mock, test } from 'claude-code/testing'

const STARTED = Date.parse('2098-12-31T20:44:00Z')
const NOW = Date.parse('2098-12-31T22:00:00Z')
const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 4,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 4 },
  view: {},
} as const
const SUBSCRIPTION = [{ kind: 'five_hour', percentUsed: 20 }]

const start = async ($: any, on: any, rateLimits: unknown[]) => {
  mock.store(on)
  mock.clock(on, { now: NOW })
  on('session.start', ($: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.usage', () => ({
    value: { startedAt: STARTED, context: { window: 200000 }, rateLimits, cost: { usd: 1 } },
  }))
  on('classic.SessionStart', () => ({}))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
}

const resume = ($: any, idleMin: number, expired = false) =>
  $.classic.SessionStart({ source: 'resume', seconds_since_last_response: idleMin * 60, prompt_cache_likely_expired: expired })

test('before the first request the band shows no cache, and Pip idles', async ($, on) => {
  await start($, on, SUBSCRIPTION)

  const band = await $.ui.mount({ plugin: 'pulse', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
  expect(await band.find({ text: 'WARM' })).toBeUndefined()
  expect(await band.find({ text: 'COLD' })).toBeUndefined()
  expect((await band.findAll({ type: 'Svg' })).map(s => s.props.alt)).toEqual(['Pip, idle'])
  await band.unmount()
})

test('on a subscription the cache stays warm for an hour', async ($, on) => {
  await start($, on, SUBSCRIPTION)
  await resume($, 18)

  const band = await $.ui.mount({ plugin: 'pulse', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
  expect(await band.find({ text: 'WARM' })).toBeDefined()
  expect(await band.find({ text: ' 42m left' })).toBeDefined()
  expect((await band.findAll({ type: 'Svg' })).map(s => s.props.alt)).toEqual(['Pip, idle'])
  await band.unmount()
})

test('on an API key the cache goes cold after five minutes, and Pip sleeps', async ($, on) => {
  await start($, on, [])
  await resume($, 18)

  const band = await $.ui.mount({ plugin: 'pulse', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
  expect(await band.find({ text: 'COLD' })).toBeDefined()
  expect(await band.find({ text: ' idle 18m' })).toBeDefined()
  expect((await band.findAll({ type: 'Svg' })).map(s => s.props.alt)).toEqual(['Pip, asleep'])
  await band.unmount()
})

test('the engine saying the cache expired wins over the clock', async ($, on) => {
  await start($, on, SUBSCRIPTION)
  await resume($, 18, true)

  const band = await $.ui.mount({ plugin: 'pulse', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
  expect(await band.find({ text: 'COLD' })).toBeDefined()
  await band.unmount()
})

test('while a turn runs Pip works, and the terminal gets a still spark', async ($, on) => {
  await start($, on, SUBSCRIPTION)
  await resume($, 18)

  const band = await $.ui.mount({
    plugin: 'pulse',
    surface: 'desktop',
    component: 'AbovePrompt',
    props: { ...PROPS, isWorking: true },
  })
  expect((await band.findAll({ type: 'Svg' })).map(s => s.props.alt)).toEqual(['Pip, working'])
  await band.unmount()

  const term = await $.ui.mount({ plugin: 'pulse', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect(await term.findAll({ type: 'Svg' })).toEqual([])
  expect(await term.find({ text: '✻ ' })).toBeDefined()
  expect(await term.find({ text: 'WARM' })).toBeDefined()
  await term.unmount()
})
