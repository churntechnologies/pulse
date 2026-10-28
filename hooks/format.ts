// How the band and the pane spell numbers. Pure.

export const usd = (n: number): string => '$' + n.toFixed(2)

/** `<1m`, `42m`, `1h 16m`, `2d 3h`. */
export const fmtSpan = (ms: number): string => {
  const mins = Math.floor(Math.max(0, ms) / 60000)
  if (mins < 1) return '<1m'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ${mins % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

/** Tokens: `850`, `245k`, `1.2M`. */
export const tok = (n: number): string =>
  n >= 1e6 ? `${Number((n / 1e6).toFixed(1))}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)

const LIMIT_NAMES: Record<string, string> = { five_hour: '5H', seven_day: '7D', spend_limit: 'SPEND' }

export const limitName = (kind: string): string => LIMIT_NAMES[kind] ?? kind.toUpperCase()

/** Percent left of a window, to one decimal at most. */
export const leftOf = (percentUsed: number): number => Math.max(0, Math.round((100 - percentUsed) * 10) / 10)

/** Time until an ISO timestamp, or '' when unknown. */
export const fmtUntil = (iso: string | undefined, now: number): string => {
  if (!iso) return ''
  const ms = Date.parse(iso) - now
  if (Number.isNaN(ms)) return ''
  return ms <= 0 ? 'now' : fmtSpan(ms)
}
