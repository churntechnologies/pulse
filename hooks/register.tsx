import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, SessionRateLimit, Timer } from 'claude-code'

import type { CacheFacts, ContextFill, Figures, Limit, Reaction, TurnRow, Ttl } from '../types'
import { fmtDuration, fmtSpan, fmtUntil, leftOf, limitName, tok, usd } from './format'
import { PIP_SIZE, pipSvg } from './pip'
import type { Mood } from './pip'

// A slim band above the prompt: what this session has cost and how fast, how
// long it has been running, whether the prompt cache is warm or cold, and, once
// they matter, the context window's fill and any usage window running low.
// Only the engine's own figures, drawn in theme colours, beside Pip, who idles,
// works, gets drowsy, sleeps, and reacts to permission asks, long turns and
// failed tools. Details opens a pane with the rest.

/** How often the band redraws, so the running time and the countdown stay current. */
const TICK_MS = 30_000

/**
 * How long the cache lives after a request: an hour on a subscription, five
 * minutes on an API key, as Claude Code picks by default. A model switch
 * reports the engine's own choice, which wins from then on.
 */
const TTL_MS: Record<Ttl, number> = { '5m': 5 * 60_000, '1h': 60 * 60_000 }
/** How long before the cache goes cold the band warns: five minutes of an hour, one of five. */
const WARN_MS: Record<Ttl, number> = { '5m': 60_000, '1h': 5 * 60_000 }

/** The context fill, in percent, from which the band shows it. */
const CONTEXT_AT = 60
/** A usage window shows once less than this percent of it is left. */
const LOW_AT = 20
/** A turn at least this long earns a hop when it ends. */
const LONG_TURN_MS = 60_000
/** How long a reaction lasts, matching its animation. */
const REACTION_MS: Record<Reaction['kind'], number> = { hop: 2500, wobble: 2200 }
/** The spend rate shows once the session has run this long, so it means something. */
const RATE_AFTER_MS = 10 * 60_000
const KEEP_TURNS = 50
const PANE = 'pulse'

const figures = atom({ plugin: 'pulse', key: 'figures' } as const, { cost: null, startedAt: 0 } as Figures)
const cache = atom(
  { plugin: 'pulse', key: 'cache' } as const,
  { lastAt: null, ttl: null, isSubscriber: false, recaches: 0 } as CacheFacts,
)
const context = atom({ plugin: 'pulse', key: 'context' } as const, { tokens: 0, window: 0, percent: null } as ContextFill)
const limits = atom({ plugin: 'pulse', key: 'limits' } as const, [] as Limit[])
const asking = atom({ plugin: 'pulse', key: 'asking' } as const, false)
const reaction = atom({ plugin: 'pulse', key: 'reaction' } as const, null as Reaction | null)
const turns = atom({ plugin: 'pulse', key: 'turns' } as const, [] as TurnRow[])

export const ttlOf = (c: CacheFacts): Ttl => c.ttl ?? (c.isSubscriber ? '1h' : '5m')

/** Warm or cold now, or null before the first request. */
export const cacheState = (c: CacheFacts, now: number): 'warm' | 'cold' | null => {
  if (c.lastAt === null) return null
  return c.lastAt > 0 && now - c.lastAt < TTL_MS[ttlOf(c)] ? 'warm' : 'cold'
}

const cleanLimits = (list: readonly SessionRateLimit[]): Limit[] =>
  list.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt }))

const fillOf = (u: SessionContextUsage, prev: ContextFill): ContextFill => ({
  tokens: u.tokens && u.tokens > 0 ? u.tokens : prev.tokens,
  window: u.window || prev.window,
  percent: u.percent ?? prev.percent,
})

async function pull($: EngineInterface): Promise<void> {
  const u = await $.session.usage()
  await update($, figures, () => ({ cost: u.cost?.usd ?? null, startedAt: u.startedAt }))
  await update($, limits, () => cleanLimits(u.rateLimits))
  await update($, context, c => fillOf(u.context, c))
  if (u.rateLimits.length > 0) await update($, cache, c => ({ ...c, isSubscriber: true }))
}

// Timers for the moment the cache starts going and the moment it is gone.
let flip: Timer | null = null
let warn: Timer | null = null

async function schedule($: EngineInterface, toast: boolean): Promise<void> {
  flip?.cancel()
  warn?.cancel()
  flip = null
  warn = null
  const c = await read($, cache)
  if (!c.lastAt) return
  const ttl = ttlOf(c)
  const coldIn = c.lastAt + TTL_MS[ttl] - (await $.clock.now())
  if (coldIn <= 0) return
  flip = $.clock.after(coldIn + 1000, () => $.ui.invalidate('ui.render'))
  const warnIn = coldIn - WARN_MS[ttl]
  if (warnIn > 0) {
    warn = $.clock.after(warnIn + 500, () => {
      $.ui.invalidate('ui.render')
      if (toast) $.ui.toast(`Prompt cache goes cold in ${fmtSpan(WARN_MS[ttl])}. Send a message now to keep it warm.`)
    })
  }
}

async function react($: EngineInterface, kind: Reaction['kind']): Promise<void> {
  const until = (await $.clock.now()) + REACTION_MS[kind]
  await update($, reaction, () => ({ kind, until }))
  $.clock.after(REACTION_MS[kind] + 100, () => $.ui.invalidate('ui.render'))
}

async function openPane($: EngineInterface): Promise<void> {
  await $.ui.open({ id: PANE, title: 'Pulse' })
}

export const register: Register = (on, options) => {
  const budget = typeof options.budget === 'number' && options.budget > 0 ? options.budget : 0
  const coldToast = options.coldWarning !== false

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await pull($)
    await $.command.register({ name: 'pulse', description: 'Show pulse details: cost, cache, limits and turns' })
    $.clock.every(TICK_MS, () => $.ui.invalidate('ui.render'))
    return r
  })

  on('command.run', { command: 'pulse' }, async $ => {
    await openPane($)
    return { text: 'Pulse details opened.' }
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('cost') && e.cost) {
      const usd = e.cost.usd
      const prev = (await read($, figures)).cost
      await update($, figures, f => ({ ...f, cost: usd }))
      // What this reading added belongs to the turn running, or the last one.
      if (prev !== null && usd > prev) {
        await update($, turns, list =>
          list.length === 0 ? list : [...list.slice(0, -1), { ...list[list.length - 1]!, cost: list[list.length - 1]!.cost + usd - prev }],
        )
      }
    }
    if (e.changed.includes('rateLimits')) {
      await update($, limits, () => cleanLimits(e.rateLimits))
      if (e.rateLimits.length > 0) await update($, cache, c => ({ ...c, isSubscriber: true }))
    }
    if (e.changed.includes('context')) {
      await update($, context, c => fillOf(e.context, c))
    }
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      const row: TurnRow = { startedAt: await $.clock.now(), durationMs: null, cost: 0, tools: 0 }
      await update($, turns, list => [...list, row].slice(-KEEP_TURNS))
    }
    return next(e)
  })

  // Each main-thread request reads or writes the cache, so its start resets the clock.
  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) {
      const now = await $.clock.now()
      const wasCold = cacheState(await read($, cache), now) === 'cold'
      await update($, cache, c => ({ ...c, lastAt: now, recaches: c.recaches + (wasCold ? 1 : 0) }))
      await schedule($, coldToast)
    }
    yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId) return r
    await update($, turns, list =>
      list.length === 0 ? list : [...list.slice(0, -1), { ...list[list.length - 1]!, durationMs: e.durationMs }],
    )
    if (e.reason === 'answer' && e.durationMs >= LONG_TURN_MS) await react($, 'hop')
    return r
  })

  // A verdict of ask puts the call to a person: Pip looks up until it is answered.
  on('tool.check', async ($, e, next) => {
    const r = await next(e)
    if (r.decision === 'ask') await update($, asking, () => true)
    return r
  })

  on('tool.call', async ($, e, next) => {
    try {
      const ran = await next(e)
      if ('isError' in ran && ran.isError) await react($, 'wobble')
      if (!e.agentId) {
        await update($, turns, list =>
          list.length === 0 ? list : [...list.slice(0, -1), { ...list[list.length - 1]!, tools: list[list.length - 1]!.tools + 1 }],
        )
      }
      return ran
    } finally {
      if (await read($, asking)) await update($, asking, () => false)
    }
  })

  // /clear starts the session's clock over and, with /compact, the cache; a
  // resumed or forked session knows how long it was away and how big it is.
  on('classic.SessionStart', async ($, e, next) => {
    const r = await next(e)
    if (e.source === 'clear') {
      await pull($)
      await update($, turns, () => [])
    }
    if (e.source === 'clear' || e.source === 'compact') {
      await update($, cache, c => ({ ...c, lastAt: null }))
    } else if ((e.source === 'resume' || e.source === 'fork') && typeof e.seconds_since_last_response === 'number') {
      const lastAt = (await $.clock.now()) - e.seconds_since_last_response * 1000
      await update($, cache, c => ({ ...c, lastAt: e.prompt_cache_likely_expired ? 0 : lastAt }))
      const tokens = e.context_tokens
      if (typeof tokens === 'number' && tokens > 0) await update($, context, c => ({ ...c, tokens }))
    }
    await schedule($, coldToast)
    return r
  }).catch(($, e, next) => next(e)) // a band that fails to refresh never holds up the session

  // A new model starts with a cold cache, and the engine names the TTL it uses.
  on('classic.PostModelSwitch', async ($, e, next) => {
    const r = await next(e)
    const ttl = e.cache_ttl
    await update($, cache, c => ({ ...c, lastAt: c.lastAt === null ? null : 0, ttl }))
    await schedule($, coldToast)
    return r
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const f = await read($, figures)
    if (f.startedAt <= 0) return next(e)

    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    // Pip draws where drawings do; the terminal gets a still spark.
    const Svg = e.surface !== 'terminal' && 'Svg' in ui ? ui.Svg : null
    const now = await $.clock.now()
    const c = await read($, cache)
    const ctx = await read($, context)
    const low = (await read($, limits)).filter(l => leftOf(l.percentUsed) < LOW_AT)
    const isAsking = await read($, asking)
    const rx = await read($, reaction)

    const state = cacheState(c, now)
    const ttl = ttlOf(c)
    const coldIn = state === 'warm' ? c.lastAt! + TTL_MS[ttl] - now : 0
    const isClosing = state === 'warm' && coldIn <= WARN_MS[ttl]
    const mood: Mood = isAsking
      ? 'alert'
      : rx && rx.until > now
        ? rx.kind
        : e.props.isWorking
          ? 'working'
          : state === 'cold'
            ? 'asleep'
            : isClosing
              ? 'drowsy'
              : 'idle'

    const pip = Svg ? (
      <Box key="pip" flexShrink={0} marginRight={1} alignItems="center">
        <Svg source={pipSvg(mood)} alt={`Pip, ${mood}`} width={PIP_SIZE} height={PIP_SIZE} isInteractive />
      </Box>
    ) : (
      <Text key="pip" color={isAsking ? 'warning' : state === 'cold' ? 'inactive' : 'claude'}>✻ </Text>
    )

    // What it cost, against the budget when one is set, and how fast.
    const spent = f.cost
    const costColor = budget > 0 && spent !== null ? (spent >= budget ? 'error' : spent >= budget * 0.8 ? 'warning' : 'text') : 'text'
    const elapsed = now - f.startedAt
    const rate = spent !== null && spent > 0 && elapsed >= RATE_AFTER_MS ? spent / (elapsed / 3_600_000) : null
    const session = (
      <Box key="session" flexDirection="row" flexShrink={0} marginRight={3}>
        <Text color="inactive" bold>SESSION  </Text>
        {spent !== null ? <Text color={costColor} bold tabular>{usd(spent)}</Text> : null}
        {spent !== null && budget > 0 ? <Text color="inactive">{` / ${usd(budget)}`}</Text> : null}
        {rate !== null ? <Text color="inactive" tabular>{` · ${usd(rate)}/h`}</Text> : null}
        {spent !== null ? <Text color="inactive"> · </Text> : null}
        <Text color="text" tabular>{fmtSpan(elapsed)}</Text>
      </Box>
    )

    let readout = null
    if (state) {
      const isWarm = state === 'warm'
      const hue = isWarm ? (isClosing ? 'warning' : 'claude') : 'suggestion'
      const detail = isWarm
        ? `${fmtSpan(coldIn)} left`
        : [c.lastAt ? `idle ${fmtSpan(now - c.lastAt)}` : '', ctx.tokens > 0 ? `re-sends ${tok(ctx.tokens)}` : '']
            .filter(Boolean)
            .join(' · ')
      readout = (
        <Box key="cache" flexDirection="row" flexShrink={0} marginRight={3}>
          <Text color={hue}>● </Text>
          <Text color={hue} bold>{isWarm ? 'WARM' : 'COLD'}</Text>
          {detail ? <Text color="inactive" tabular>{` ${detail}`}</Text> : null}
        </Box>
      )
    }

    const fill =
      ctx.percent !== null && ctx.percent >= CONTEXT_AT ? (
        <Box key="ctx" flexDirection="row" flexShrink={0} marginRight={3}>
          <Text color="inactive">ctx </Text>
          <Text color={ctx.percent >= 90 ? 'error' : ctx.percent >= 80 ? 'warning' : 'text'} bold tabular>
            {`${ctx.percent}%`}
          </Text>
        </Box>
      ) : null

    const windows = low.map(l => {
      const left = leftOf(l.percentUsed)
      const reset = fmtUntil(l.resetsAt, now)
      return (
        <Box key={`limit-${l.kind}`} flexDirection="row" flexShrink={0} marginRight={3}>
          <Text color="inactive" bold>{`${limitName(l.kind)} `}</Text>
          <Text color={left < 5 ? 'error' : 'warning'} bold tabular>{`${left}% left`}</Text>
          {reset ? <Text color="inactive" tabular>{` · resets ${reset}`}</Text> : null}
        </Box>
      )
    })

    return (
      <Box flexDirection="row" paddingX={1} alignItems="center">
        {pip}
        <Box flexDirection="row" flexWrap="wrap" flexGrow={1} alignItems="center">
          {session}
          {readout}
          {fill}
          {windows}
        </Box>
        <Box flexShrink={0}>
          <Button key="pulse-details" label="Details" onPress={() => void openPane($)} />
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const f = await read($, figures)
    const c = await read($, cache)
    const ctx = await read($, context)
    const list = await read($, limits)
    const done = await read($, turns)

    const row = (label: string, value: string, color = 'text') => (
      <Box key={label} flexDirection="row">
        <Box width={12} flexShrink={0}>
          <Text color="inactive">{label}</Text>
        </Box>
        <Text color={color} tabular>{value}</Text>
      </Box>
    )
    const heading = (text: string) => (
      <Box key={`h-${text}`} marginTop={1}>
        <Text color="inactive" bold>{text}</Text>
      </Box>
    )

    const elapsed = now - f.startedAt
    const spent = f.cost
    const state = cacheState(c, now)
    const ttl = ttlOf(c)
    const cacheLine =
      state === 'warm'
        ? `WARM · cold in ${fmtSpan(c.lastAt! + TTL_MS[ttl] - now)}`
        : state === 'cold'
          ? c.lastAt
            ? `COLD · idle ${fmtSpan(now - c.lastAt)}`
            : 'COLD'
          : 'no request yet'
    const ttlLine = `${ttl === '1h' ? '1 hour' : '5 minutes'}${c.ttl ? ' (from the engine)' : c.isSubscriber ? ' (subscription)' : ' (API key)'}`

    return (
      <Box flexDirection="column" paddingX={1}>
        {heading('SESSION')}
        {row('Cost', spent !== null ? usd(spent) : 'not reported')}
        {spent !== null && elapsed >= RATE_AFTER_MS && spent > 0 ? row('Rate', `${usd(spent / (elapsed / 3_600_000))}/h`) : null}
        {budget > 0 && spent !== null
          ? row(
              'Budget',
              `${usd(budget)} · ${Math.round((spent / budget) * 100)}% used`,
              spent >= budget ? 'error' : spent >= budget * 0.8 ? 'warning' : 'text',
            )
          : null}
        {row('Running', fmtSpan(elapsed))}

        {heading('PROMPT CACHE')}
        {row('State', cacheLine, state === 'warm' ? 'claude' : state === 'cold' ? 'suggestion' : 'inactive')}
        {row('Lasts', ttlLine)}
        {ctx.tokens > 0 ? row('Holds', `${tok(ctx.tokens)} tokens, re-sent when cold`) : null}
        {row('Re-caches', String(c.recaches))}

        {heading('CONTEXT')}
        {row('Fill', ctx.percent !== null ? `${ctx.percent}% of ${tok(ctx.window)}` : 'after the first reply')}

        {heading('USAGE LIMITS')}
        {list.length === 0 ? row('', 'none reported (API key, or before the first reply)', 'inactive') : null}
        {list.map(l => {
          const left = leftOf(l.percentUsed)
          const reset = fmtUntil(l.resetsAt, now)
          return row(
            limitName(l.kind),
            `${left}% left${reset ? ` · resets ${reset}` : ''}`,
            left < 5 ? 'error' : left < LOW_AT ? 'warning' : 'text',
          )
        })}

        {heading('RECENT TURNS')}
        {done.length === 0 ? row('', 'none yet', 'inactive') : null}
        {done
          .slice(-8)
          .reverse()
          .map(t =>
            row(
              `${fmtSpan(now - t.startedAt)} ago`,
              `${usd(t.cost)} · ${t.durationMs === null ? 'running' : fmtDuration(t.durationMs)} · ${t.tools} tool${t.tools === 1 ? '' : 's'}`,
            ),
          )}
      </Box>
    )
  })
}
