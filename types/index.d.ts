/** What the band remembers: the session's cost in US dollars, absent where the host keeps no ledger, and when it began. */
export type Figures = { cost: number | null; startedAt: number }

/** How long the prompt cache lives after a request reads or writes it. */
export type Ttl = '5m' | '1h'

/**
 * The prompt cache: when the main thread last sent a request (null before the
 * first, 0 when it is known cold with no time, as after a model switch), the TTL
 * the engine reported if it has, whether the session is on a subscription,
 * which decides the TTL otherwise.
 */
export type CacheFacts = { lastAt: number | null; ttl: Ttl | null; isSubscriber: boolean }

/** The context window: tokens the last response was answered over (what a cold cache re-sends), and its fill. */
export type ContextFill = { tokens: number; window: number; percent: number | null }

/** A usage window as the engine reports it: `five_hour`, `seven_day`, `spend_limit`. */
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

/** A short reaction of Pip's, shown until `until`. */
export type Reaction = { kind: 'hop' | 'wobble'; until: number }

declare module 'claude-code' {
  interface PluginState {
    pulse: {
      figures: Figures
      cache: CacheFacts
      context: ContextFill
      limits: Limit[]
      asking: boolean
      reaction: Reaction | null
    }
  }
}
