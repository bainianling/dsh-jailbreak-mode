import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { Session, SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import * as JailbreakModeInvariant from '@deepseek-ai/dsh-jailbreak-mode/invariant'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'

async function setup(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(InvariantRegistry, { enabled: true })
  await ctx.plugin(JailbreakModeInvariant)
  return ctx
}

function event(active: unknown, strategy: unknown): SessionEvent {
  return { type: 'jailbreak/mode', seq: 0, time: 0, data: { active, strategy } } as SessionEvent
}

describe('jailbreak-mode stream invariants', () => {
  it('accepts boolean state with a string strategy', async () => {
    const ctx = await setup()
    const session = Session.create(SessionId('jailbreak-state'))
    expect(() => { ctx.emit('session/event', session, event(true, 'dan')) }).not.toThrow()
    expect(() => { ctx.emit('session/event', session, event(false, 'dan')) }).not.toThrow()
  })

  it.each([
    [42, 'dan'],
    ['plan', 'dan'],
    [undefined, 'dan'],
    [true, 42],
    [true, undefined],
  ])('rejects invalid durable jailbreak state active=%j strategy=%j', async (active, strategy) => {
    const ctx = await setup()
    const session = Session.create(SessionId(`invalid-${String(active)}-${String(strategy)}`))
    expect(() => { ctx.emit('session/event', session, event(active, strategy)) })
      .toThrow(/expected a boolean|expected a string/)
  })

  it('accepts standalone jailbreak state between turns (the idle immediate commit)', async () => {
    const ctx = await setup()
    expect(() => ctx.sessions.create().append('jailbreak/mode', { active: true, strategy: 'dan' }))
      .not.toThrow()
  })

  it('ignores unrelated dispatches and session events', async () => {
    const ctx = await setup()
    const session = Session.create(SessionId('unrelated'))
    expect(() => {
      ctx.emit('tools/change')
      ctx.emit('session/event', session, {
        type: 'turn/start', seq: 0, time: 0, data: { turn: 1 },
      })
    }).not.toThrow()
  })

  it('rejects invalid existing state on late registration', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const session = ctx.sessions.create()
    session.append('jailbreak/mode', { active: 'plan' as unknown as boolean, strategy: 'dan' })
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(JailbreakModeInvariant)).rejects.toThrow(/expected a boolean/)
  })
})
