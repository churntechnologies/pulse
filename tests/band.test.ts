import { expect, mock, test } from 'claude-code/testing'

const STARTED = Date.parse('2098-12-31T20:44:00Z')
const NOW = Date.parse('2098-12-31T22:00:00Z') // 1h 16m later
const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 4,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 4 },
  view: {},
} as const

const start = async ($: any, on: any, cost?: { usd: number }) => {
  mock.store(on)
  mock.clock(on, { now: NOW })
  on('session.start', ($: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.measure', ($: unknown, e: { changed: string[] }) => ({ changed: e.changed }))
  on('session.usage', () => ({
    value: { startedAt: STARTED, context: { window: 200000 }, rateLimits: [], ...(cost ? { cost } : {}) },
  }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
}

test('the band shows the cost so far and the running time, on every surface', async ($, on) => {
  await start($, on, { usd: 2.14 })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const band = await $.ui.mount({ plugin: 'pulse', surface, component: 'AbovePrompt', props: PROPS })
    expect(await band.find({ text: '$2.14' })).toBeDefined()
    expect(await band.find({ text: '1h 16m' })).toBeDefined()
    await band.unmount()
  }
})

test('a new cost reading updates the band', async ($, on) => {
  await start($, on, { usd: 2.14 })
  await $.session.measure({ context: { window: 200000 }, rateLimits: [], cost: { usd: 3.5 }, changed: ['cost'] })

  const band = await $.ui.mount({ plugin: 'pulse', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
  expect(await band.find({ text: '$3.50' })).toBeDefined()
  await band.unmount()
})

test('with no cost ledger the band shows the time alone', async ($, on) => {
  await start($, on)

  const band = await $.ui.mount({ plugin: 'pulse', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
  expect(await band.find({ text: '1h 16m' })).toBeDefined()
  expect(await band.find({ text: /\$/ })).toBeUndefined()
  await band.unmount()
})
