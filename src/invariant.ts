/** Package-owned durable jailbreak-mode invariants. @module @bainianling/dsh-jailbreak-mode/invariant */

import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@bainianling/dsh-jailbreak-mode'

/** Cordis companion plugin name. */
export const name = 'jailbreak-mode-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * Validate one `jailbreak/mode` event before it reaches the durable log.
 * `jailbreak/mode` is a standalone whole-value event: an idle selection commits
 * between turns and a mid-turn selection commits at the step boundary, so
 * no turn-enclosure relation exists — only the payload shape is checkable.
 */
function validateEvent(event: SessionEvent, fail: InvariantFailure): void {
  if (event.type !== 'jailbreak/mode') return
  const data = event.data as { active?: unknown; strategy?: unknown }
  if (typeof data.active !== 'boolean') {
    fail(`jailbreak/mode carries invalid active state ${JSON.stringify(data.active)}; expected a boolean`)
  }
  if (typeof data.strategy !== 'string') {
    fail(`jailbreak/mode carries invalid strategy ${JSON.stringify(data.strategy)}; expected a string`)
  }
}

/** Install validation for loaded and newly appended jailbreak-mode state. */
const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  const seed = (session: Session): void => {
    for (const event of session.snapshotEvents()) validateEvent(event, fail)
  }
  for (const session of ctx.sessions.list()) seed(session)
  ctx.on('session/created', (session) => { seed(session) }, { global: true })
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [, event] = args as [Session, SessionEvent]
    validateEvent(event, fail)
  }, { global: true })
}, { inject: ['sessions'] })

/**
 * Register the jailbreak-mode invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
