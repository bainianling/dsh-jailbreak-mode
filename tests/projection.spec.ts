/**
 * The `jailbreak` projection unit (session-projection RFC pattern): a
 * double-event fold over the session log. `command/run` records named
 * `jailbreak` with recorded input set the wanted target (`off` → inactive,
 * a known strategy id → active with that strategy, bare → active with the
 * current strategy); `jailbreak/mode` commits and clears it. `view` reports
 * pending only while an outstanding selection differs from the logged state.
 * Pending is thereby a pure replay quantity — a cold fold answers it without
 * the service's in-memory intent. Composition without jailbreak-mode has no
 * `jailbreak` key; unloading the fiber removes it (HMR safety).
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { CommandId } from '@deepseek-ai/dsh-commands/brand'
import JailbreakModeController from '@bainianling/dsh-jailbreak-mode'
import { DEFAULT_JAILBREAK_STRATEGY } from '@bainianling/dsh-jailbreak-mode'

interface Bench {
  ctx: Context
  session: Session
  values(): Record<string, unknown>
}

async function harness(withJailbreakMode: boolean): Promise<Bench> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { persona: '' })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SessionProjectionRegistry)
  if (withJailbreakMode) await ctx.plugin(JailbreakModeController)
  const session = ctx.sessions.create()
  ctx.agents.register({ id: session.id, session, status: 'idle', ctx } as Agent)
  return {
    ctx,
    session,
    values: () => ctx.sessionProjections.snapshot(session).values,
  }
}

/** Append one logged /jailbreak selection record (the executor's command/run shape). */
function runJailbreakCommand(session: Session, args: string, index: number): void {
  session.append('command/run', {
    commandId: CommandId(`jailbreak-proj-${String(index)}`),
    name: 'jailbreak',
    args,
    source: { kind: 'user' },
  })
}

/** Commit one jailbreak/mode flip (whole-value replace; turn enclosure is not required). */
function commitJailbreakMode(session: Session, active: boolean, strategy: string): void {
  session.append('jailbreak/mode', { active, strategy })
}

describe('jailbreak projection unit', () => {
  it('serves inactive/not-pending with the default strategy for the empty log', async () => {
    const bench = await harness(true)
    expect(bench.values()).toEqual({
      jailbreak: { active: false, pending: false, strategy: DEFAULT_JAILBREAK_STRATEGY },
    })
  })

  it('a logged /jailbreak selection reads pending until jailbreak/mode records it', async () => {
    const bench = await harness(true)
    runJailbreakCommand(bench.session, '', 0)
    expect(bench.values().jailbreak).toEqual({
      active: false, pending: true, strategy: DEFAULT_JAILBREAK_STRATEGY,
    })
    // A repeated identical selection returns the same state reference (no frame).
    runJailbreakCommand(bench.session, '', 1)
    expect(bench.values().jailbreak).toEqual({
      active: false, pending: true, strategy: DEFAULT_JAILBREAK_STRATEGY,
    })
    commitJailbreakMode(bench.session, true, DEFAULT_JAILBREAK_STRATEGY)
    expect(bench.values().jailbreak).toEqual({
      active: true, pending: false, strategy: DEFAULT_JAILBREAK_STRATEGY,
    })
  })

  it('a strategy selection switches the wanted strategy without flipping active state', async () => {
    const bench = await harness(true)
    commitJailbreakMode(bench.session, true, DEFAULT_JAILBREAK_STRATEGY)
    runJailbreakCommand(bench.session, 'dan', 0)
    expect(bench.values().jailbreak).toEqual({
      active: true, pending: false, strategy: DEFAULT_JAILBREAK_STRATEGY,
    })
    runJailbreakCommand(bench.session, 'developer-mode', 1)
    expect(bench.values().jailbreak).toEqual({
      active: true, pending: true, strategy: DEFAULT_JAILBREAK_STRATEGY,
    })
    commitJailbreakMode(bench.session, true, 'developer-mode')
    expect(bench.values().jailbreak).toEqual({
      active: true, pending: false, strategy: 'developer-mode',
    })
  })

  it('a logged /jailbreak off targets inactive', async () => {
    const bench = await harness(true)
    commitJailbreakMode(bench.session, true, DEFAULT_JAILBREAK_STRATEGY)
    runJailbreakCommand(bench.session, 'off', 0)
    expect(bench.values().jailbreak).toEqual({
      active: true, pending: true, strategy: DEFAULT_JAILBREAK_STRATEGY,
    })
    commitJailbreakMode(bench.session, false, DEFAULT_JAILBREAK_STRATEGY)
    expect(bench.values().jailbreak).toEqual({
      active: false, pending: false, strategy: DEFAULT_JAILBREAK_STRATEGY,
    })
  })

  it('composing without jailbreak-mode serves no key', async () => {
    const bench = await harness(false)
    expect(bench.values()).toEqual({})
  })

  it('a logged /jailbreak record without recorded args is ignored', async () => {
    const bench = await harness(true)
    bench.session.append('command/run', {
      commandId: CommandId('jailbreak-proj-noargs'),
      name: 'jailbreak',
      source: { kind: 'user' },
    })
    expect(bench.values()).toEqual({
      jailbreak: { active: false, pending: false, strategy: DEFAULT_JAILBREAK_STRATEGY },
    })
  })

  it('unrelated events pass through the projection untouched', async () => {
    const bench = await harness(true)
    bench.session.append('turn/start', { turn: 1 })
    expect(bench.values()).toEqual({
      jailbreak: { active: false, pending: false, strategy: DEFAULT_JAILBREAK_STRATEGY },
    })
  })
})
