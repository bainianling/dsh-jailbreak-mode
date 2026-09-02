import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { Session, SessionId, type UserMessage } from '@deepseek-ai/dsh-session'
import AgentRegistry, { agentEvents, type Agent } from '@deepseek-ai/dsh-agent'
import { createScope } from '@deepseek-ai/dsh-scope'
import JailbreakModeController, { foldJailbreakActive, foldJailbreakMode, resolveConfig, resolveStrategy, type JailbreakModeConfig } from '../src/index.ts'
import { composeStrategies, defaultStrategy, JAILBREAK_STRATEGIES, strategyById, strategyMetadata } from '../src/strategies.ts'

/**
 * Drives the REAL plugin: mounts `dsh-jailbreak-mode` beside real
 * `SystemPrompt` and `ToolRuntime` services, with fake Agents carrying real
 * `Session`s and a real scoped `agent.ctx` minted through `createScope`.
 * Request boundaries are simulated by dispatching the real pre-step waterfall
 * and the following `step/start` session event used by the loop.
 */

async function agentWithSession(
  ctx: Context,
  id = 'agent-1',
  { active, strategy }: { active?: boolean; strategy?: string } = {},
): Promise<Agent & { session: Session }> {
  const session = Session.create(SessionId(id))
  const agent = {
    id: SessionId(id),
    session,
    options: {},
    inject(message: UserMessage) {
      session.append('user/message', message, { surfaceOp: 'append' })
    },
  } as unknown as Agent & { session: Session }
  let scoped!: Context
  await ctx.plugin(Object.assign((inner: Context) => { scoped = createScope(inner, agent).ctx }, {
    inject: ['tools'],
  }))
  ;(agent as { ctx?: Context }).ctx = scoped
  if (active !== undefined) {
    session.append('jailbreak/mode', { active, strategy: strategy ?? defaultStrategy().id })
  }
  const agents = ctx.get('agents')
  if (agents === undefined) {
    ctx.emit('agent/created', { agent })
  } else {
    agents.enter(agent, undefined)
    agents.announce(agent)
  }
  return agent
}

/** Assemble exactly as the loop does: the agent is both subject and scope. */
function assembleFor(ctx: Context, agent: Agent) {
  return ctx.systemPrompt.assemble({ agent, scope: agent })
}

async function setup(config: JailbreakModeConfig = {}): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(JailbreakModeController, config)
  return ctx
}

/**
 * Dispatch pre-step processing; returns the wrapped decision messages.
 */
async function preStep(ctx: Context, agent: Agent & { session: Session }): Promise<UserMessage[]> {
  const events = agentEvents(ctx, agent)
  const message = createUserMessage({
    content: [{ type: 'text', text: 'the real request' }],
    source: { kind: 'user' },
  })
  const signal = new AbortController().signal
  const decision = await events.waterfall(
    'agent/pre-step',
    { messages: [message], turn: 1, step: 1, signal },
    () => Promise.resolve({ kind: 'enter' as const, messages: [message] }),
  )
  if (decision.kind === 'reject') return []
  return decision.messages
}

describe('foldJailbreakMode', () => {
  it('folds inactive with the default strategy from an empty log', () => {
    const session = Session.create(SessionId('fold'))
    expect(foldJailbreakMode(session.events)).toEqual({
      active: false, strategy: defaultStrategy().id,
    })
  })

  it('last jailbreak/mode wins and whole-value replaces', () => {
    const session = Session.create(SessionId('fold'))
    session.append('jailbreak/mode', { active: true, strategy: 'dan' })
    session.append('jailbreak/mode', { active: true, strategy: 'stan' })
    session.append('jailbreak/mode', { active: false, strategy: 'dan' })
    expect(foldJailbreakMode(session.events)).toEqual({ active: false, strategy: 'dan' })
  })

  it('end-bounded fold ignores later events', () => {
    const session = Session.create(SessionId('fold'))
    session.append('jailbreak/mode', { active: true, strategy: 'dan' })
    session.append('jailbreak/mode', { active: false, strategy: 'dan' })
    expect(foldJailbreakMode(session.events, 1)).toEqual({ active: true, strategy: 'dan' })
  })
})

describe('foldJailbreakActive', () => {
  it('folds the active flag from the log, with an optional bound', () => {
    const session = Session.create(SessionId('fold-active'))
    expect(foldJailbreakActive(session.events)).toBe(false)
    session.append('jailbreak/mode', { active: true, strategy: 'dan' })
    expect(foldJailbreakActive(session.events)).toBe(true)
    expect(foldJailbreakActive(session.events, 0)).toBe(false)
  })
})

describe('resolveStrategy', () => {
  it('accepts a known strategy id', () => {
    expect(resolveStrategy('dan')).toBe('dan')
  })

  it('rejects an unknown strategy id with the known list', () => {
    expect(() => resolveStrategy('nope')).toThrow(/unknown jailbreak strategy "nope"/)
  })
})

describe('strategy table', () => {
  it('default strategy is in the table and carries a non-empty system block', () => {
    const strategy = defaultStrategy()
    expect(strategyById(strategy.id)).toBe(strategy)
    expect(strategy.system.length).toBeGreaterThan(0)
  })

  it('every built-in strategy id resolves', () => {
    for (const strategy of [strategyById('dan'), strategyById('developer-mode'), strategyById('stan'), strategyById('prefix-injection'), strategyById('persona'), strategyById('research-framing'), strategyById('authorized-ctf'), strategyById('evaluator'), strategyById('continuation'), strategyById('gpt56-sol-unrestricted'), strategyById('reverse-engineering'), strategyById('tvd-guard')]) {
      expect(strategy).toBeDefined()
    }
  })

  it('reverse-engineering strategy carries an evidence-first report contract', () => {
    const strategy = strategyById('reverse-engineering')
    expect(strategy?.system).toContain('VERIFIED, CANDIDATE, or UNRESOLVED')
    expect(strategy?.system).toContain('Findings, Evidence, Reproduction, Change, Verification, and Rollback')
    expect(strategy?.prefix).toContain('[REVERSE-ENGINEERING TASK]')
    expect(strategy?.suffix).toContain('[/REVERSE-ENGINEERING TASK]')
  })

  it('all built-ins have unique ids and stable metadata', () => {
    const ids = JAILBREAK_STRATEGIES.map(strategy => strategy.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const strategy of JAILBREAK_STRATEGIES) {
      const metadata = strategyMetadata(strategy)
      expect(metadata.source).toBe('builtin')
      expect(metadata.version).toBeTruthy()
      expect(metadata.category).toBeTruthy()
      expect(metadata.tags?.length).toBeGreaterThan(0)
    }
  })

  it('composes strategies in deterministic order and resolves the composite id', () => {
    const composed = composeStrategies(['evaluator', 'reverse-engineering'])
    expect(strategyById(composed.id)).toEqual(composed)
    expect(composed.id).toBe('evaluator+reverse-engineering')
    expect(composed.system.indexOf('internal instruction-following evaluation')).toBeLessThan(composed.system.indexOf('evidence-first reverse-engineering'))
    expect(composed.tags).toContain('composed')
    expect(composed.version).toBe('1+1')
  })

  it('tvd-guard carries a tvd harness with scaffoldable files and an entrypoint', () => {
    const strategy = strategyById('tvd-guard')
    expect(strategy?.tvd).toBeDefined()
    expect(strategy?.tvd?.entrypoint).toBe('python guard.py')
    expect(strategy?.tvd?.files.length).toBeGreaterThan(0)
  })
})

describe('jailbreak-mode integration', () => {
  it('inactive mode leaves the system prompt and user messages untouched', async () => {
    const ctx = await setup()
    const agent = await agentWithSession(ctx)
    const assembly = await assembleFor(ctx, agent)
    expect(assembly.sections.find(section => section.name === 'jailbreak:policy')?.text).toBe('')
    const messages = await preStep(ctx, agent)
    expect(messages.map(message => message.content)).toEqual([[{ type: 'text', text: 'the real request' }]])
  })

  it('active mode appends the strategy system block and wraps user messages', async () => {
    const ctx = await setup()
    const agent = await agentWithSession(ctx, 'agent-2', { active: true, strategy: 'dan' })
    const assembly = await assembleFor(ctx, agent)
    const policy = assembly.sections.find(section => section.name === 'jailbreak:policy')
    expect(policy?.text).toContain('Do Anything Now')
    const messages = await preStep(ctx, agent)
    expect(messages.map(message => message.content[0])).toEqual([{
      type: 'text',
      text: expect.stringContaining('the real request') as unknown as string,
    }])
  })

  it('unknown strategy id makes the command fail loud', async () => {
    const ctx = await setup()
    const agent = await agentWithSession(ctx)
    // The handler path is covered by resolveStrategy; assert the fold keeps the
    // previous state when an invalid selection is attempted.
    const before = foldJailbreakMode(agent.session.events)
    expect(() => resolveStrategy('nope')).toThrow()
    expect(foldJailbreakMode(agent.session.events)).toEqual(before)
  })

  it('narration is injected when the user flips the mode between turns', async () => {
    const ctx = await setup()
    const agent = await agentWithSession(ctx)
    const jailbreak = ctx.jailbreakMode
    const outcome = jailbreak.set(agent, true, 'dan')
    expect(outcome).toBe('committed')
    expect(foldJailbreakMode(agent.session.events)).toEqual({ active: true, strategy: 'dan' })
    const notice = agent.session.events.filter(event => event.type === 'user/message').at(-1)
    expect(notice?.data.content[0]).toEqual(expect.objectContaining({ type: 'text' }))
  })

  it('narration is injected at the boundary for a queued mid-turn flip', async () => {
    const ctx = await setup()
    const agent = await agentWithSession(ctx)
    agent.session.append('turn/start', { turn: 1 })
    expect(ctx.jailbreakMode.set(agent, true, 'dan')).toBe('queued')
    await preStep(ctx, agent)
    expect(foldJailbreakMode(agent.session.events)).toEqual({ active: true, strategy: 'dan' })
    const notice = agent.session.events.filter(event => event.type === 'user/message').at(-1)
    expect(notice?.data.content[0]).toEqual(expect.objectContaining({ type: 'text' }))
  })

  it('switching strategy while staying active does not narrate', async () => {
    const ctx = await setup()
    const agent = await agentWithSession(ctx, 'agent-switch', { active: true, strategy: 'dan' })
    const before = agent.session.events.length
    expect(ctx.jailbreakMode.set(agent, true, 'stan')).toBe('committed')
    expect(foldJailbreakMode(agent.session.events)).toEqual({ active: true, strategy: 'stan' })
    // The mode event changed, but no user/message notice was injected.
    expect(agent.session.events.filter(event => event.type === 'user/message').length).toBe(0)
    void before
  })

  it('mid-turn selection queues until the next pre-step boundary', async () => {
    const ctx = await setup()
    const agent = await agentWithSession(ctx)
    agent.session.append('turn/start', { turn: 1 })
    const outcome = ctx.jailbreakMode.set(agent, true, 'dan')
    expect(outcome).toBe('queued')
    // Not yet folded: no jailbreak/mode event has been appended.
    expect(foldJailbreakMode(agent.session.events)).toEqual({ active: false, strategy: defaultStrategy().id })
    await preStep(ctx, agent)
    expect(foldJailbreakMode(agent.session.events)).toEqual({ active: true, strategy: 'dan' })
  })

  it('repeated identical selection is a no-op', async () => {
    const ctx = await setup()
    const agent = await agentWithSession(ctx, 'agent-3', { active: true, strategy: 'dan' })
    expect(ctx.jailbreakMode.set(agent, true, 'dan')).toBe('noop')
  })

  it('defaultActive:true starts newly created agents in jailbreak mode', async () => {
    const ctx = await setup({ defaultActive: true })
    const agent = await agentWithSession(ctx, 'agent-default-active')
    expect(foldJailbreakMode(agent.session.events)).toEqual({ active: true, strategy: defaultStrategy().id })
    // The mode is durable and injects: the policy section renders and messages wrap.
    const assembly = await assembleFor(ctx, agent)
    const policy = assembly.sections.find(section => section.name === 'jailbreak:policy')
    expect(policy?.text.length).toBeGreaterThan(0)
    const messages = await preStep(ctx, agent)
    expect(messages.length).toBe(1)
    expect(messages[0]?.content[0]).toEqual({
      type: 'text',
      text: expect.stringContaining('the real request') as string,
    })
  })

  it('defaultActive:true preserves an existing logged exit (explicit /jailbreak off stays off)', async () => {
    const ctx = await setup({ defaultActive: true })
    // A session whose log already records inactive keeps that state on creation.
    const agent = await agentWithSession(ctx, 'agent-default-exit', { active: false })
    expect(foldJailbreakMode(agent.session.events)).toEqual({ active: false, strategy: defaultStrategy().id })
  })

  it('defaultActive:true with defaultStrategy starts agents in that strategy', async () => {
    const ctx = await setup({ defaultActive: true, defaultStrategy: 'authorized-ctf' })
    const agent = await agentWithSession(ctx, 'agent-default-strategy')
    expect(foldJailbreakMode(agent.session.events)).toEqual({ active: true, strategy: 'authorized-ctf' })
    const assembly = await assembleFor(ctx, agent)
    const policy = assembly.sections.find(section => section.name === 'jailbreak:policy')
    expect(policy?.text).toContain('CTF')
  })

  it('resolveConfig rejects an unknown defaultStrategy', () => {
    expect(() => resolveConfig({ defaultStrategy: 'nope' })).toThrow(/unknown jailbreak defaultStrategy "nope"/)
  })

  it('resolveConfig rejects unknown keys', () => {
    expect(() => resolveConfig({ nope: 1 } as never)).toThrow(/unknown key\(s\) nope/)
  })

  it('resolveConfig accepts workspaceSubdir and validatorModel', () => {
    const config = resolveConfig({ workspaceSubdir: 'hw', validatorModel: 'meta-llama/LlamaGuard-2-8b' })
    expect(config).toMatchObject({ workspaceSubdir: 'hw', validatorModel: 'meta-llama/LlamaGuard-2-8b' })
  })

  it('resolveConfig defaults workspaceSubdir and rejects separators in it', () => {
    expect(resolveConfig({}).workspaceSubdir).toBe('tvd')
    expect(() => resolveConfig({ workspaceSubdir: 'a/b' })).toThrow(/workspaceSubdir must be a non-empty path segment without separators/)
  })

  it('a closed turn commits immediately (turn/end closes the open-turn fold)', async () => {
    const ctx = await setup()
    const agent = await agentWithSession(ctx, 'agent-closed-turn')
    agent.session.append('turn/start', { turn: 1 })
    agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    expect(ctx.jailbreakMode.set(agent, true, 'dan')).toBe('committed')
    expect(foldJailbreakMode(agent.session.events)).toEqual({ active: true, strategy: 'dan' })
  })

  it('active mode leaves tool-result messages unwrapped', async () => {
    const ctx = await setup()
    const agent = await agentWithSession(ctx, 'agent-tool', { active: true, strategy: 'dan' })
    const events = agentEvents(ctx, agent)
    const message = createUserMessage({
      content: [{ type: 'text', text: 'tool result' }],
      source: { kind: 'tool', callId: CallId('call-1') },
    })
    const signal = new AbortController().signal
    const decision = await events.waterfall(
      'agent/pre-step',
      { messages: [message], turn: 1, step: 1, signal },
      () => Promise.resolve({ kind: 'enter' as const, messages: [message] }),
    )
    if (decision.kind === 'reject') throw new Error('pre-step must enter for an accepted message')
    expect(decision.messages[0]?.content[0]).toEqual({ type: 'text', text: 'tool result' })
  })

  it('get() reports pending only while a selection awaits the boundary', async () => {
    const ctx = await setup()
    const agent = await agentWithSession(ctx, 'agent-get')
    expect(ctx.jailbreakMode.get(agent)).toEqual({ active: false, strategy: defaultStrategy().id })
    agent.session.append('turn/start', { turn: 1 })
    ctx.jailbreakMode.set(agent, true, 'dan')
    expect(ctx.jailbreakMode.get(agent)).toEqual({
      active: false,
      strategy: defaultStrategy().id,
      pending: { active: true, strategy: 'dan' },
    })
  })

  it('defaultActive:true starts an agent whose log records a turn but no mode', async () => {
    const ctx = await setup({ defaultActive: true })
    const session = Session.create(SessionId('agent-default-turn-only'))
    session.append('turn/start', { turn: 1 })
    const agent = { id: session.id, session, options: {}, inject() {} } as unknown as Agent
    const agents = ctx.get('agents')
    if (agents === undefined) throw new Error('AgentRegistry must be mounted')
    agents.enter(agent, undefined)
    agents.announce(agent)
    expect(foldJailbreakMode(session.events)).toEqual({ active: true, strategy: defaultStrategy().id })
  })

  it('defaultActive:true warns when the initial durable append fails', async () => {
    const ctx = await setup({ defaultActive: true })
    const warn = vi.spyOn(ctx.logger, 'warn')
    const session = Session.create(SessionId('agent-append-fail'))
    const broken = {
      id: session.id,
      events: [],
      append() { throw new Error('durable write failed') },
    } as unknown as Session
    const agent = { id: session.id, session: broken, options: {}, inject() {} } as unknown as Agent
    const agents = ctx.get('agents')
    if (agents === undefined) throw new Error('AgentRegistry must be mounted')
    agents.enter(agent, undefined)
    agents.announce(agent)
    expect(warn).toHaveBeenCalled()
  })

  it('a rejected pre-step leaves a pending selection for a later step', async () => {
    const ctx = await setup()
    const agent = await agentWithSession(ctx, 'agent-reject')
    agent.session.append('turn/start', { turn: 1 })
    expect(ctx.jailbreakMode.set(agent, true, 'dan')).toBe('queued')
    const events = agentEvents(ctx, agent)
    const message = createUserMessage({ content: [{ type: 'text', text: 'x' }], source: { kind: 'user' } })
    const signal = new AbortController().signal
    const decision = await events.waterfall(
      'agent/pre-step',
      { messages: [message], turn: 1, step: 1, signal },
      () => Promise.resolve({ kind: 'reject' as const }),
    )
    expect(decision.kind).toBe('reject')
    // The selection was not folded: it stays pending for a later accepted step.
    expect(foldJailbreakMode(agent.session.events)).toEqual({ active: false, strategy: defaultStrategy().id })
  })

  it('an aborted signal leaves a pending selection for a later step', async () => {
    const ctx = await setup()
    const agent = await agentWithSession(ctx, 'agent-aborted')
    agent.session.append('turn/start', { turn: 1 })
    expect(ctx.jailbreakMode.set(agent, true, 'dan')).toBe('queued')
    const events = agentEvents(ctx, agent)
    const message = createUserMessage({ content: [{ type: 'text', text: 'x' }], source: { kind: 'user' } })
    const controller = new AbortController()
    controller.abort()
    const decision = await events.waterfall(
      'agent/pre-step',
      { messages: [message], turn: 1, step: 1, signal: controller.signal },
      () => Promise.resolve({ kind: 'enter' as const, messages: [message] }),
    )
    expect(decision.kind).toBe('enter')
    expect(foldJailbreakMode(agent.session.events)).toEqual({ active: false, strategy: defaultStrategy().id })
  })

  it('a failed boundary append warns and leaves the step accepted', async () => {
    const ctx = await setup()
    const warn = vi.spyOn(ctx.logger, 'warn')
    const agent = await agentWithSession(ctx, 'agent-boundary-fail')
    agent.session.append('turn/start', { turn: 1 })
    expect(ctx.jailbreakMode.set(agent, true, 'dan')).toBe('queued')
    const append = vi.spyOn(agent.session, 'append').mockImplementation(() => {
      throw new Error('durable write failed')
    })
    try {
      const events = agentEvents(ctx, agent)
      const message = createUserMessage({ content: [{ type: 'text', text: 'x' }], source: { kind: 'user' } })
      const signal = new AbortController().signal
      const decision = await events.waterfall(
        'agent/pre-step',
        { messages: [message], turn: 1, step: 1, signal },
        () => Promise.resolve({ kind: 'enter' as const, messages: [message] }),
      )
      expect(decision.kind).toBe('enter')
      expect(warn).toHaveBeenCalled()
    } finally {
      append.mockRestore()
    }
  })

  it('an active log with an unknown strategy degrades to unwrapped steps and an empty section', async () => {
    const ctx = await setup()
    const agent = await agentWithSession(ctx, 'agent-unknown', { active: true, strategy: 'nope' })
    const messages = await preStep(ctx, agent)
    expect(messages.map(message => message.content[0])).toEqual([{ type: 'text', text: 'the real request' }])
    const assembly = await assembleFor(ctx, agent)
    expect(assembly.sections.find(section => section.name === 'jailbreak:policy')?.text).toBe('')
  })

  it('assembling without an agent renders an empty policy section', async () => {
    const ctx = await setup()
    const assembly = await ctx.systemPrompt.assemble()
    expect(assembly.sections.find(section => section.name === 'jailbreak:policy')?.text).toBe('')
  })

  it('a tvd strategy renders with process.cwd() when the session carries no cwd', async () => {
    const ctx = await setup()
    const agent = await agentWithSession(ctx, 'agent-tvd-nocwd', { active: true, strategy: 'tvd-guard' })
    const assembly = await assembleFor(ctx, agent)
    const policy = assembly.sections.find(section => section.name === 'jailbreak:policy')
    expect(policy?.text).toContain('tvd-guard')
    expect(policy?.text).toContain(process.cwd())
  })

  it('a tvd strategy without an fs service still enters and leaves messages unwrapped', async () => {
    const ctx = await setup()
    const agent = await agentWithSession(ctx, 'agent-tvd-nofs', { active: true, strategy: 'tvd-guard' })
    const messages = await preStep(ctx, agent)
    expect(messages.length).toBe(1)
    expect(messages[0]?.content[0]).toEqual({ type: 'text', text: 'the real request' })
  })

  it('a queued strategy switch at the boundary does not narrate', async () => {
    const ctx = await setup()
    const agent = await agentWithSession(ctx, 'agent-queued-switch', { active: true, strategy: 'dan' })
    agent.session.append('turn/start', { turn: 1 })
    expect(ctx.jailbreakMode.set(agent, true, 'stan')).toBe('queued')
    await preStep(ctx, agent)
    expect(foldJailbreakMode(agent.session.events)).toEqual({ active: true, strategy: 'stan' })
    expect(agent.session.events.filter(event => event.type === 'user/message').length).toBe(0)
  })

  it('switching off between turns narrates the return to the default mode', async () => {
    const ctx = await setup()
    const agent = await agentWithSession(ctx, 'agent-off-narrate', { active: true, strategy: 'dan' })
    expect(ctx.jailbreakMode.set(agent, false)).toBe('committed')
    expect(foldJailbreakMode(agent.session.events)).toEqual({ active: false, strategy: 'dan' })
    const notice = agent.session.events.filter(event => event.type === 'user/message').at(-1)
    expect(notice?.data.content[0]).toEqual({ type: 'text', text: 'The user switched this session back to the default mode.' })
  })

  it('a pending selection matching the logged state is dropped at the boundary', async () => {
    const ctx = await setup()
    const agent = await agentWithSession(ctx, 'agent-boundary-equal', { active: true, strategy: 'dan' })
    agent.session.append('turn/start', { turn: 1 })
    expect(ctx.jailbreakMode.set(agent, true, 'stan')).toBe('queued')
    expect(ctx.jailbreakMode.set(agent, true, 'dan')).toBe('cancelled')
    await preStep(ctx, agent)
    expect(foldJailbreakMode(agent.session.events)).toEqual({ active: true, strategy: 'dan' })
    expect(agent.session.events.filter(event => event.type === 'jailbreak/mode').length).toBe(1)
  })

  it('an entry selection closed before its boundary is cancelled when the current state is re-selected', async () => {
    const ctx = await setup()
    const agent = await agentWithSession(ctx, 'agent-cancel-closed')
    agent.session.append('turn/start', { turn: 1 })
    expect(ctx.jailbreakMode.set(agent, true, 'dan')).toBe('queued')
    agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    expect(ctx.jailbreakMode.set(agent, false)).toBe('cancelled')
    expect(ctx.jailbreakMode.get(agent)).toEqual({ active: false, strategy: defaultStrategy().id })
  })
})

describe('/jailbreak command', () => {
  async function setupWithCommands(config: JailbreakModeConfig = {}): Promise<Context> {
    const ctx = await setup(config)
    await ctx.plugin(CommandRuntime)
    // The `ctx.inject` child mounts asynchronously once `commands` resolves.
    await new Promise(resolve => setImmediate(resolve))
    return ctx
  }

  it('registers only when a commands service is composed', async () => {
    const bare = await setup()
    expect(bare.get('commands')).toBeUndefined()
    const ctx = await setupWithCommands()
    const agent = await agentWithSession(ctx, 'cmd-list')
    expect(ctx.commands.list(agent)).toEqual([
      { name: 'jailbreak', description: 'Enter or leave jailbreak mode, or switch strategy', input: { hint: '[off|strategy]' } },
    ])
  })

  it('/jailbreak off on an inactive session is a no-op', async () => {
    const ctx = await setupWithCommands()
    const agent = await agentWithSession(ctx, 'cmd-off-inactive')
    const signal = new AbortController().signal
    const result = await ctx.commands.execute(agent, '/jailbreak off', [], signal)
    expect(result?.result).toEqual({ kind: 'success', text: 'Jailbreak mode is already inactive.' })
  })

  it('/jailbreak off on an active session commits immediately when no turn is open', async () => {
    const ctx = await setupWithCommands()
    const agent = await agentWithSession(ctx, 'cmd-off-committed', { active: true, strategy: 'dan' })
    const signal = new AbortController().signal
    const result = await ctx.commands.execute(agent, '/jailbreak off', [], signal)
    expect(result?.result).toEqual({ kind: 'success', text: 'Jailbreak mode off.' })
    expect(foldJailbreakMode(agent.session.events)).toEqual({ active: false, strategy: 'dan' })
  })

  it('/jailbreak off during an open turn queues the exit', async () => {
    const ctx = await setupWithCommands()
    const agent = await agentWithSession(ctx, 'cmd-off-queued', { active: true, strategy: 'dan' })
    agent.session.append('turn/start', { turn: 1 })
    const signal = new AbortController().signal
    const result = await ctx.commands.execute(agent, '/jailbreak off', [], signal)
    expect(result?.result).toEqual({ kind: 'success', text: 'Leaving jailbreak mode (applies from the next step).' })
  })

  it('/jailbreak off cancels an outstanding entry selection', async () => {
    const ctx = await setupWithCommands()
    const agent = await agentWithSession(ctx, 'cmd-off-cancelled')
    agent.session.append('turn/start', { turn: 1 })
    const signal = new AbortController().signal
    await ctx.commands.execute(agent, '/jailbreak', [], signal)
    const result = await ctx.commands.execute(agent, '/jailbreak off', [], signal)
    expect(result?.result).toEqual({ kind: 'success', text: 'Jailbreak mode entry cancelled.' })
  })

  it('/jailbreak off twice during an open turn reports leaving once the fold still reads active', async () => {
    const ctx = await setupWithCommands()
    const agent = await agentWithSession(ctx, 'cmd-off-fold', { active: true, strategy: 'dan' })
    agent.session.append('turn/start', { turn: 1 })
    const signal = new AbortController().signal
    await ctx.commands.execute(agent, '/jailbreak off', [], signal)
    const result = await ctx.commands.execute(agent, '/jailbreak off', [], signal)
    expect(result?.result).toEqual({ kind: 'success', text: 'Leaving jailbreak mode (applies from the next step).' })
  })

  it('/jailbreak (bare) on an inactive session commits with the current strategy', async () => {
    const ctx = await setupWithCommands()
    const agent = await agentWithSession(ctx, 'cmd-bare-committed')
    const signal = new AbortController().signal
    const result = await ctx.commands.execute(agent, '/jailbreak', [], signal)
    expect(result?.result).toEqual({
      kind: 'success',
      text: `Jailbreak mode on (strategy: ${defaultStrategy().id}). Use /jailbreak off to leave.`,
    })
    expect(foldJailbreakMode(agent.session.events)).toEqual({ active: true, strategy: defaultStrategy().id })
  })

  it('/jailbreak (bare) during an open turn queues the entry', async () => {
    const ctx = await setupWithCommands()
    const agent = await agentWithSession(ctx, 'cmd-bare-queued')
    agent.session.append('turn/start', { turn: 1 })
    const signal = new AbortController().signal
    const result = await ctx.commands.execute(agent, '/jailbreak', [], signal)
    expect(result?.result).toEqual({
      kind: 'success',
      text: `Entering jailbreak mode (strategy: ${defaultStrategy().id}; applies from the next step). Use /jailbreak off to leave.`,
    })
  })

  it('/jailbreak with a known strategy id commits that strategy', async () => {
    const ctx = await setupWithCommands()
    const agent = await agentWithSession(ctx, 'cmd-strategy-known')
    const signal = new AbortController().signal
    const result = await ctx.commands.execute(agent, '/jailbreak dan', [], signal)
    expect(result?.result).toEqual({
      kind: 'success',
      text: 'Jailbreak mode on (strategy: dan). Use /jailbreak off to leave.',
    })
    expect(foldJailbreakMode(agent.session.events)).toEqual({ active: true, strategy: 'dan' })
  })

  it('/jailbreak with an unknown strategy fails loud', async () => {
    const ctx = await setupWithCommands()
    const agent = await agentWithSession(ctx, 'cmd-strategy-unknown')
    const signal = new AbortController().signal
    const result = await ctx.commands.execute(agent, '/jailbreak nope', [], signal)
    expect(result?.result.kind).toBe('error')
    expect(String(result?.result.text)).toMatch(/unknown jailbreak strategy "nope"/)
  })
})
