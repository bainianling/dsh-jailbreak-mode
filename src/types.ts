/**
 * Pure types of the jailbreak domain: the ONE home of the `jailbreak`
 * projection-key declaration, free of this package's host-side value imports
 * (cordis service, dsh-tools, dsh-agent). Two namespace projections serve it —
 * `./types` for host consumers, `./client` for client aggregates — with zero
 * content duplication.
 *
 * @module @deepseek-ai/dsh-jailbreak-mode/types
 */

/**
 * The jailbreak projection's wire value. `active` is the logged state in force
 * (the last `jailbreak/mode`, inactive before the first); `strategy` is the id
 * of the strategy selected with that state (the last whole-value replace, so a
 * strategy selection and its state flip land together); `pending` is true while
 * a logged `/jailbreak` selection (`command/run`) targets a state other than
 * `active` and no later `jailbreak/mode` event has recorded that state.
 * Capability absence (jailbreak-mode not composed) is the key's absence, never
 * a value.
 */
export interface JailbreakProjection {
  active: boolean
  pending: boolean
  strategy: string
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Jailbreak collaboration state folded from `command/run` (name `jailbreak`) and `jailbreak/mode` events. */
    jailbreak: JailbreakProjection
  }
}
