# pulse

A Claude Code mod that adds a slim band above your prompt:

```
✻ SESSION  $2.14 / $10.00 · $1.69/h · 1h 16m   ● WARM 42m left   ctx 72%   5H 12% left · resets 1h 40m   [Details]
```

- **Cost so far**, as `/cost` totals it, and the **spend rate** once the session
  has run 10 minutes. Set a **budget** and the cost turns amber at 80% and red past it.
- **Running time.** `/clear` starts it over.
- **Prompt cache, warm or cold.** `WARM 42m left` while your next message reads the
  cache cheaply. It turns amber 5 minutes before it expires, with an optional toast.
  `COLD idle 3h 5m · re-sends 245k` once it has expired, with how many tokens the
  next message sends again.
- **Context fill**, from 60%: amber at 80%, red at 90%.
- **Usage windows** (5-hour, 7-day) only once one has less than 20% left, with its reset.
- **Pip**, a little pixel critter: idles, works while Claude runs, gets drowsy as the
  cache is about to expire, sleeps when it is cold, looks up with a `!` while a
  permission is asked, hops after a turn of a minute or more, and wobbles when a tool fails.
- **Details** (or `/pulse`) opens a pane with all of it: cost, rate, budget, cache
  state and TTL, re-caches, context, every usage window and the recent turns with
  what each cost.

The cache lasts an hour on a Claude subscription and five minutes on an API key,
as Claude Code picks by default. After a model switch it uses the TTL the engine
reports. If you set `FORCE_PROMPT_CACHING_5M` or `ENABLE_PROMPT_CACHING_1H`, the
band can't see it until your next model switch.

Every number is one Claude Code already keeps; the mod never calls a model, so it
costs nothing to run. Pip moves with CSS animation inside a small drawing that the
app plays by itself: no hook runs and nothing is redrawn while it moves. It stands
still if your system asks for reduced motion, and the terminal shows a still `✻`.
Everything draws in your theme's colours.

## Options

Set them in `/config` under pulse:

- **Session budget (USD)**: 0 leaves it off.
- **Warn before the cache goes cold**: on by default.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install pulse --marketplace churntechnologies/pulse
```

Answer `y` to add the marketplace, then pick the user scope with Enter. Or from a shell:

```
claude plugin install pulse --marketplace churntechnologies/pulse
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box,
then Plugins, Add marketplace with `churntechnologies/pulse`, then Add plugin.

The band shows up in your next session.

### Updates

Turn on auto-update for the marketplace in `/plugin` → Marketplaces and new
versions arrive by themselves. Otherwise run:

```
claude plugin update pulse@pulse
```

## Remove

```
claude plugin uninstall pulse@pulse
```

## Develop

```
claude plugin validate .
claude plugin test .
```

- `hooks/register.tsx` is the band.
- `hooks/pip.ts` draws Pip.
- `hooks/format.ts` spells the numbers.
- `types/index.d.ts` is the shape of what the band remembers.
- `tests/` checks the band on every surface.
