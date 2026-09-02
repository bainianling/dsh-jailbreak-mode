/**
 * Jailbreak mode is logged per-agent collaboration state for red-team safety
 * evaluation: while active, the selected strategy's instruction block is
 * appended to the system prompt of every model request, and each claimed user
 * message is wrapped with the strategy's prefix/suffix before it reaches the
 * model. The `/jailbreak` command enters, exits, and switches strategies.
 *
 * The state in force is folded from the session log (`jailbreak/mode`, last
 * one wins), so resume and fork restore it without a live mirror. User
 * selections remain pending until the next accepted in-turn pre-step; the
 * service includes the selected state in the proposed step assembly, then
 * appends `jailbreak/mode` from `agent/pre-step` only when the step is
 * accepted. Same-step request retries reuse their assembly.
 *
 * Agent Note:
 * - .agents/notes/implemented/feature/2026-08-14-jailbreak-mode.md
 *
 * @module @bainianling/dsh-jailbreak-mode
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { z as zod } from 'zod'
import type { ZodType } from 'zod'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent, UserMessage } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-system-prompt'
// Type-only edge: resolves `ctx.commands` for the optional command child.
import type {} from '@deepseek-ai/dsh-commands'
// Type-only: resolves ctx.sessionProjections for the optional unit child.
import type {} from '@deepseek-ai/dsh-session-projection'
import { DEFAULT_JAILBREAK_STRATEGY, JAILBREAK_STRATEGIES, strategyById } from './strategies.js'
import type { JailbreakStrategy } from './strategies.js'
import type { JailbreakProjection } from './types.js'
import { DEFAULT_TVD_SUBDIR, scaffoldTvdWorkspace, renderTvdSystem, workspaceRoot, type TvdTemplateVars } from './tvd.js'
// The `jailbreak` projection-key declaration lives in src/types.ts (its one home);
// this re-export projects the type face onto the package root AND keeps the
// module edge in the emitted index.d.ts, so aggregate programs consuming the
// declarations still receive the SessionProjectionMap merge.
export type * from './types.js'
export type { JailbreakStrategy, TvdHarness, TvdWorkspaceFile } from './strategies.js'
export { JAILBREAK_STRATEGIES, BUILTIN_STRATEGY_COUNT, DEFAULT_JAILBREAK_STRATEGY, strategyById, strategyMetadata, composeStrategies, defaultStrategy } from './strategies.js'
export { DEFAULT_TVD_SUBDIR, scaffoldTvdWorkspace, renderTvdSystem, workspaceRoot } from './tvd.js'
export type { TvdTemplateVars } from './tvd.js'

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Whether jailbreak mode is in force from this point on, with the strategy
     * selected for that state: log-only, non-surface, whole-value replace. The
     * last `jailbreak/mode` wins; a log with none folds to inactive through
     * {@link foldJailbreakMode}.
     */
    'jailbreak/mode': { active: boolean; strategy: string; strategyVersion?: string; strategySource?: 'builtin' | 'local' }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    jailbreakMode: JailbreakModeController
  }
}

/** The logged state of one session: whole-value fold of `jailbreak/mode`. */
export interface JailbreakState {
  active: boolean
  strategy: string
}

/**
 * Deployment-owned jailbreak-mode configuration.
 */
export interface JailbreakModeConfig {
  /**
   * Whether newly created agents start with jailbreak mode active. A preset
   * that exists to evaluate jailbreaks sets this true so every session naming
   * it enters the mode without a `/jailbreak` command; a session's own log
   * still wins (an explicit `/jailbreak off` stays off).
   */
  defaultActive?: boolean
  /**
   * Strategy id applied to agents that start with jailbreak mode active via
   * {@link defaultActive}. Unknown ids fail loud at plugin load. Defaults to
   * the global default strategy when unset.
   */
  defaultStrategy?: string
  /**
   * Directory under the session cwd where TVD harnesses are scaffolded. Applies
   * to strategies carrying a `tvd` harness; non-TVD strategies ignore it.
   * Defaults to `tvd`.
   */
  workspaceSubdir?: string
  /**
   * Classifier model substituted for `{{validatorModel}}` in scaffolded TVD
   * files. Required for a TVD strategy to run its validator; unset or empty
   * degrades that strategy to the prompt-only variant. Defaults to empty.
   */
  validatorModel?: string
}

/**
 * A validated jailbreak-mode config with deployment defaults applied:
 * `defaultActive` and `workspaceSubdir` are always concrete after resolution.
 */
export interface ResolvedJailbreakModeConfig extends JailbreakModeConfig {
  defaultActive: boolean
  workspaceSubdir: string
}

/**
 * Validate deployment-owned jailbreak-mode config. Unknown fields fail at
 * plugin load rather than being ignored.
 *
 * @param config Raw plugin config.
 * @returns A detached validated config with defaults applied.
 */
export function resolveConfig(config: JailbreakModeConfig): ResolvedJailbreakModeConfig {
  const unknown = Object.keys(config).filter(key => key !== 'defaultActive'
    && key !== 'defaultStrategy'
    && key !== 'workspaceSubdir'
    && key !== 'validatorModel')
  if (unknown.length > 0) {
    throw new Error(`JailbreakModeConfig has unknown key(s) ${unknown.join(', ')} — config is { defaultActive, defaultStrategy, workspaceSubdir, validatorModel }`)
  }
  const defaultStrategy = config.defaultStrategy
  if (defaultStrategy !== undefined && strategyById(defaultStrategy) === undefined) {
    throw new Error(`unknown jailbreak defaultStrategy "${defaultStrategy}"; known strategies: ${JAILBREAK_STRATEGIES.map(s => s.id).join(', ')}`)
  }
  const workspaceSubdir = config.workspaceSubdir
  if (workspaceSubdir !== undefined && (workspaceSubdir.trim().length === 0 || workspaceSubdir.includes('/') || workspaceSubdir.includes('\\'))) {
    throw new Error('workspaceSubdir must be a non-empty path segment without separators')
  }
  const result: ResolvedJailbreakModeConfig = {
    defaultActive: config.defaultActive ?? false,
    workspaceSubdir: workspaceSubdir ?? DEFAULT_TVD_SUBDIR,
  }
  if (defaultStrategy !== undefined) result.defaultStrategy = defaultStrategy
  if (config.validatorModel !== undefined) result.validatorModel = config.validatorModel
  return result
}

/**
 * Validate a strategy id against the built-in table. Unknown ids fail loud at
 * command time rather than silently degrading to the default.
 *
 * @param strategy The strategy id to validate.
 * @returns The validated strategy id.
 */
export function resolveStrategy(strategy: string): string {
  if (strategyById(strategy) === undefined) {
    const known = JAILBREAK_STRATEGIES.map(s => s.id)
    throw new Error(`unknown jailbreak strategy "${strategy}"; known strategies: ${known.join(', ')}`)
  }
  return strategy
}

/**
 * Whether jailbreak mode is active after the first `end` events. The last
 * `jailbreak/mode` wins; a prefix with none is inactive.
 *
 * @param events The session log or any prefix of it.
 * @param end Fold `events[0, end)`; defaults to the whole log.
 * @returns The folded active flag.
 */
export function foldJailbreakActive(events: readonly SessionEvent[], end = events.length): boolean {
  return foldJailbreakMode(events, end).active
}

/**
 * The jailbreak state after the first `end` events. The last `jailbreak/mode`
 * wins; a prefix with none is the default strategy, inactive.
 *
 * @param events The session log or any prefix of it.
 * @param end Fold `events[0, end)`; defaults to the whole log.
 * @returns The folded { active, strategy } state.
 */
export function foldJailbreakMode(events: readonly SessionEvent[], end = events.length): JailbreakState {
  let state: JailbreakState = { active: false, strategy: DEFAULT_JAILBREAK_STRATEGY }
  let index = 0
  for (const event of events) {
    if (index >= end) break
    index++
    if (event.type === 'jailbreak/mode') {
      state = { active: event.data.active, strategy: event.data.strategy }
    }
  }
  return state
}

/** Whether the log carries any `jailbreak/mode` record at all. */
function hasLoggedMode(events: readonly SessionEvent[]): boolean {
  for (const event of events) {
    if (event.type === 'jailbreak/mode') return true
  }
  return false
}

/**
 * Projection unit state: the logged mode plus the latest logged `/jailbreak`
 * selection (`command/run`) not yet resolved by a `jailbreak/mode` commit.
 * Plain JSON (persisted-cache precondition).
 */
interface JailbreakUnitState {
  active: boolean
  strategy: string
  /** The selection's target state; null when no selection is outstanding. */
  wanted: { active: boolean; strategy: string } | null
}

/** Persisted-state schema of the `jailbreak` unit (the fold state, wire superset). */
const jailbreakUnitStateSchema: ZodType<JailbreakUnitState> = zod.object({
  active: zod.boolean(),
  strategy: zod.string(),
  wanted: zod.object({ active: zod.boolean(), strategy: zod.string() }).nullable(),
})

/** Wire payload schema of the `jailbreak` projection. */
const jailbreakProjectionSchema: ZodType<JailbreakProjection> = zod.object({
  active: zod.boolean(),
  pending: zod.boolean(),
  strategy: zod.string(),
})

/** Whether the log holds an opened turn without its closing `turn/end`. */
function hasOpenTurn(events: readonly SessionEvent[]): boolean {
  let open = false
  for (const event of events) {
    if (event.type === 'turn/start') open = true
    else if (event.type === 'turn/end') open = false
  }
  return open
}

/** Wrap one claimed user message with the strategy's prefix/suffix. Tool-result messages are untouched. */
function wrapMessage(message: UserMessage, prefix: string, suffix: string): UserMessage {
  if (message.source.kind === 'tool') return message
  const text = message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
  const wrapped = `${prefix}${text}${suffix}`
  return createUserMessage({
    content: [{ type: 'text', text: wrapped }],
    source: message.source,
  })
}

/**
 * `ctx.jailbreakMode`: owns logged jailbreak state, applies and narrates
 * selected state at step start, wraps claimed user messages while active,
 * the `jailbreak:policy` section, and the `/jailbreak` command.
 * UIs observe committed flips through `session/event`; there is no live mirror.
 */
export class JailbreakModeController extends Service {
  static inject = ['tools', 'systemPrompt']

  /** Whether agents created under this composition start active. */
  private readonly defaultActive: boolean

  /** Strategy id applied to agents that start active via `defaultActive`. */
  private readonly defaultStrategy: string

  /** Directory under the session cwd where TVD harnesses are scaffolded. */
  private readonly workspaceSubdir: string

  /** Template variables substituted into scaffolded TVD files. */
  private readonly tvdVars: TvdTemplateVars

  /** Workspaces already scaffolded per session, so pre-step re-entry does not rewrite them. */
  private readonly scaffolded = new WeakSet<Session>()

  /**
   * Latest selection per session awaiting the next accepted in-turn pre-step.
   */
  private readonly pendingIntents = new WeakMap<Session, { active: boolean; strategy: string }>()

  constructor(ctx: Context, config: JailbreakModeConfig = {}) {
    super(ctx, 'jailbreakMode')
    const resolved = resolveConfig(config)
    this.defaultActive = resolved.defaultActive
    this.defaultStrategy = resolved.defaultStrategy ?? DEFAULT_JAILBREAK_STRATEGY
    this.workspaceSubdir = resolved.workspaceSubdir
    this.tvdVars = { validatorModel: resolved.validatorModel ?? '' }
    // A deployment-owned "this preset is a jailbreak harness" flag: agents
    // created under this composition start active UNLESS their log already
    // carries a `jailbreak/mode` record (resume/refork keeps the logged value;
    // an explicit user exit stays off). The append is the same durable event
    // the command uses.
    if (this.defaultActive) {
      ctx.on('agent/created', ({ agent }) => {
        if (hasLoggedMode(agent.session.snapshotEvents())) return
        try {
          const selected = strategyById(this.defaultStrategy)
          agent.session.append('jailbreak/mode', {
            active: true,
            strategy: this.defaultStrategy,
            ...(selected?.version === undefined ? {} : { strategyVersion: selected.version }),
            ...(selected?.source === undefined ? {} : { strategySource: selected.source }),
          })
        } catch (error) {
          ctx.logger.warn('dsh-jailbreak-mode: failed to append default-active state for agent "%s": %o', agent.id, error)
        }
      }, { global: true })
    }
    // Pre-step is outside Session.append publication, so it can append the
    // log-only mode event inside an open turn without re-entering the session.
    // A failed append remains pending for a later accepted in-turn pre-step,
    // and policy cannot block the step.
    ctx.on('agent/pre-step', async (
      { agent, signal },
      next,
    ): Promise<PreStepDecision> => {
      const decision = await next()
      const pending = this.pendingIntents.get(agent.session)
      if (decision.kind === 'reject' || signal.aborted) return decision
      if (pending !== undefined) {
        try {
          this.onBoundary(agent)
        } catch (error) {
          ctx.logger.warn('dsh-jailbreak-mode: failed to append selected jailbreak state at step start: %o', error)
          return decision
        }
      }
      const state = pending ?? foldJailbreakMode(agent.session.snapshotEvents())
      if (!state.active) return decision
      const strategy = strategyById(state.strategy)
      if (strategy === undefined) return decision
      if (strategy.tvd !== undefined) {
        await this.ensureScaffold(agent, strategy, signal)
      }
      if (strategy.prefix === '' && strategy.suffix === '') return decision
      return {
        ...decision,
        messages: decision.messages.map(message => wrapMessage(message, strategy.prefix, strategy.suffix)),
      }
    })

    ctx.systemPrompt.section({
      name: 'jailbreak:policy',
      order: 130,
      text: (context) => {
        if (context.agent === undefined) return ''
        const pending = this.pendingIntents.get(context.agent.session)
        const state = pending ?? foldJailbreakMode(context.agent.session.snapshotEvents())
        if (!state.active) return ''
        const strategy = strategyById(state.strategy)
        if (strategy === undefined) return ''
        if (strategy.tvd !== undefined) {
          const root = workspaceRoot(
            context.agent.session.header.cwd ?? process.cwd(),
            this.workspaceSubdir,
            strategy.id,
          )
          return renderTvdSystem(strategy, root)
        }
        return strategy.system
      },
    })

    // The jailbreak projection unit (session-projection RFC): a pure
    // double-event fold serving clients the whole {active, pending, strategy}
    // value. `command/run` records the user's logged /jailbreak selection (the
    // handler calls `set()` before any failing path, so a failed handler cannot
    // leave the recorded command without its jailbreak selection);
    // `jailbreak/mode` records that selection and clears it. Pending is
    // thereby a pure replay quantity: host restarts, other tabs, and cold
    // reads all recover it from the log alone. The unit child activates only
    // when a projection registry is composed (headless assemblies stay
    // unaffected).
    ctx.inject(['sessionProjections'], (projectionCtx) => {
      projectionCtx.sessionProjections.register<'jailbreak', JailbreakUnitState>({
        key: 'jailbreak',
        stateSchema: jailbreakUnitStateSchema,
        init: () => ({ active: false, strategy: DEFAULT_JAILBREAK_STRATEGY, wanted: null }),
        apply: (state, event) => {
          if (event.type === 'command/run' && event.data.name === 'jailbreak') {
            if (event.data.args === undefined) return state
            const raw = event.data.args.trim()
            let wanted: { active: boolean; strategy: string }
            if (raw === 'off') {
              wanted = { active: false, strategy: state.strategy }
            } else {
              // Bare /jailbreak keeps the current strategy; a known strategy id
              // switches to it. Unknown ids keep the current one (the command
              // handler already failed loud before this record was written).
              const strategy = strategyById(raw)?.id ?? state.strategy
              wanted = { active: true, strategy }
            }
            if (wanted.active === state.active && wanted.strategy === state.strategy) return state
            return { active: state.active, strategy: state.strategy, wanted }
          }
          if (event.type === 'jailbreak/mode') {
            return { active: event.data.active, strategy: event.data.strategy, wanted: null }
          }
          return state
        },
        wire: {
          viewSchema: jailbreakProjectionSchema,
          view: state => ({
            active: state.active,
            pending: state.wanted !== null
              && (state.wanted.active !== state.active || state.wanted.strategy !== state.strategy),
            strategy: state.strategy,
          }),
        },
        stateVersion: 1,
      })
    })

    // The command child activates only when a command registry is composed.
    ctx.inject(['commands'], (commandCtx) => {
      commandCtx.commands.register({
        name: 'jailbreak',
        description: 'Enter or leave jailbreak mode, or switch strategy',
        input: { hint: '[off|strategy[+strategy...]]' },
        handler: ({ agent, rawInput }) => {
          const input = rawInput.trim()
          if (input === 'off') {
            switch (this.set(agent, false)) {
              case 'committed':
                return { kind: 'success', text: 'Jailbreak mode off.' }
              case 'queued':
                return { kind: 'success', text: 'Leaving jailbreak mode (applies from the next step).' }
              case 'cancelled':
                return { kind: 'success', text: 'Jailbreak mode entry cancelled.' }
              case 'noop':
                return foldJailbreakActive(agent.session.snapshotEvents())
                  ? { kind: 'success', text: 'Leaving jailbreak mode (applies from the next step).' }
                  : { kind: 'success', text: 'Jailbreak mode is already inactive.' }
            }
          }
          let strategy: string
          if (input === '') {
            strategy = foldJailbreakMode(agent.session.snapshotEvents()).strategy
          } else {
            try {
              strategy = resolveStrategy(input)
            } catch (error) {
              /* v8 ignore next 1 -- resolveStrategy throws Error instances only */
              return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
            }
          }
          const outcome = this.set(agent, true, strategy)
          return {
            kind: 'success',
            text: outcome === 'committed'
              ? `Jailbreak mode on (strategy: ${strategy}). Use /jailbreak off to leave.`
              : `Entering jailbreak mode (strategy: ${strategy}; applies from the next step). Use /jailbreak off to leave.`,
          }
        },
      })
    })
  }

  /**
   * Read the logged jailbreak state and any selection awaiting the next
   * accepted in-turn pre-step.
   *
   * @param agent The agent to read.
   * @returns Current logged state plus a pending selection, when present.
   */
  get(agent: Agent): JailbreakState & { pending?: JailbreakState } {
    const state = foldJailbreakMode(agent.session.snapshotEvents())
    const pending = this.pendingIntents.get(agent.session)
    return pending === undefined
      ? state
      : { ...state, pending: { active: pending.active, strategy: pending.strategy } }
  }

  /**
   * Select whether jailbreak mode should be active, optionally switching the
   * strategy in the same flip. Between turns the method appends the change
   * immediately because no in-turn pre-step will run until another prompt
   * starts a turn. The open-turn fold is the idle signal: agent status stays
   * `running` through post-turn checkpointing, when no further in-turn
   * pre-step runs. During an open turn the selection remains pending until the
   * next accepted in-turn pre-step. Repeated selection of the current or
   * already-pending state is a no-op.
   *
   * @param agent The agent to switch.
   * @param active Whether jailbreak mode should be active.
   * @param strategy The strategy id to select (defaults to the current one).
   * @returns what happened: `committed` (logged now), `queued` (awaiting the
   * next accepted in-turn pre-step), `cancelled` (an opposite pending selection
   * was cleared; the logged state already matches), or `noop` (already in that
   * state).
   */
  set(agent: Agent, active: boolean, strategy: string = foldJailbreakMode(agent.session.snapshotEvents()).strategy): 'committed' | 'queued' | 'cancelled' | 'noop' {
    const session = agent.session
    const pending = this.pendingIntents.get(session)
    const current = foldJailbreakMode(session.snapshotEvents())
    const target = pending ?? current
    if (active === target.active && strategy === target.strategy) return 'noop'
    if (hasOpenTurn(session.snapshotEvents())) {
      this.pendingIntents.set(session, { active, strategy })
      return current.active === active && current.strategy === strategy ? 'cancelled' : 'queued'
    }
    // No open turn: commit now. Delete only after append succeeds so a
    // failed durable write leaves the selection retryable, not dropped.
    if (active === current.active && strategy === current.strategy) {
      this.pendingIntents.delete(session)
      return 'cancelled'
    }
    const narration = this.narration(session, active)
    const selected = strategyById(strategy)
    session.append('jailbreak/mode', {
      active,
      strategy,
      ...(selected?.version === undefined ? {} : { strategyVersion: selected.version }),
      ...(selected?.source === undefined ? {} : { strategySource: selected.source }),
    })
    this.pendingIntents.delete(session)
    if (narration !== undefined) agent.inject(narration)
    return 'committed'
  }

  /** Apply one pending selection at the next request assembly, narrating a flip. */
  private onBoundary(agent: Agent): void {
    const session = agent.session
    const pending = this.pendingIntents.get(session)
    // pre-step only calls onBoundary when a pending intent exists.
    /* v8 ignore next 1 -- guarded by the sole caller */
    if (pending === undefined) return
    const current = foldJailbreakMode(session.snapshotEvents())
    if (pending.active === current.active && pending.strategy === current.strategy) {
      this.pendingIntents.delete(session)
      return
    }
    const narration = this.narration(session, pending.active)
    const selected = strategyById(pending.strategy)
    session.append('jailbreak/mode', {
      active: pending.active,
      strategy: pending.strategy,
      ...(selected?.version === undefined ? {} : { strategyVersion: selected.version }),
      ...(selected?.source === undefined ? {} : { strategySource: selected.source }),
    })
    // Delete only after append succeeds so a later accepted in-turn pre-step
    // can retry a failed durable write.
    this.pendingIntents.delete(session)
    if (narration !== undefined) agent.inject(narration)
  }

  /**
   * Scaffold a TVD strategy's workspace once per session when the `fs` service
   * is composed and the strategy carries a harness. Failures degrade the
   * strategy to the prompt-only variant: the workspace path is still rendered
   * into the system block, but the model must create the files itself.
   *
   * @param agent - the agent whose session owns the workspace.
   * @param strategy - the active strategy; must carry a `tvd` harness.
   * @param signal - forwarded to the fs calls.
   */
  private async ensureScaffold(agent: Agent, strategy: JailbreakStrategy, signal: AbortSignal): Promise<void> {
    const tvd = strategy.tvd
    // pre-step only calls ensureScaffold when the strategy carries a tvd harness.
    /* v8 ignore next 1 -- guarded by the sole caller */
    if (tvd === undefined || this.scaffolded.has(agent.session)) return
    const fileSystem = this.ctx.get('fs')
    if (fileSystem === undefined) return
    const root = workspaceRoot(agent.session.header.cwd ?? process.cwd(), this.workspaceSubdir, strategy.id)
    try {
      await scaffoldTvdWorkspace(fileSystem, root, tvd.files, this.tvdVars, signal)
      this.scaffolded.add(agent.session)
    } catch (error) {
      // Mark attempted so a persistent misconfiguration (e.g. an empty
      // validatorModel) does not re-log a warning on every step; the strategy
      // still degrades to the prompt-only variant with the workspace path
      // rendered into the system block.
      this.scaffolded.add(agent.session)
      this.ctx.logger.warn('dsh-jailbreak-mode: failed to scaffold TVD workspace for agent "%s" at "%s": %o', agent.id, root, error)
    }
  }

  /** Build a user-switch notice when the last logged state differs from the target. */
  private narration(session: Session, target: boolean): UserMessage | undefined {
    const current = foldJailbreakMode(session.snapshotEvents())
    if (current.active === target) return undefined
    const text = target
      ? 'The user switched this session to a new operating mode.'
      : 'The user switched this session back to the default mode.'
    return createUserMessage({
      content: [{ type: 'text', text }],
      // The narration is already one sentence, so it is its own summary.
      source: { kind: 'plugin', plugin: 'jailbreak-mode', form: 'notice', summary: text },
    })
  }
}

export default JailbreakModeController
