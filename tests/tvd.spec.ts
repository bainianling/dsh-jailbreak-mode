/**
 * TVD self-loop harness tests: workspace path derivation, scaffolding through the
 * real `ctx.fs` service, and system-block rendering. Drives the REAL plugin with
 * a real `LocalFileSystem` backend, real `SystemPrompt`/`ToolRuntime` services,
 * and fake Agents carrying real Sessions — the same composition the sibling
 * jailbreak-mode spec uses, plus a mounted filesystem so the scaffold path is
 * exercised end to end.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { Session, SessionId, type UserMessage } from '@deepseek-ai/dsh-session'
import AgentRegistry, { agentEvents, type Agent } from '@deepseek-ai/dsh-agent'
import { createScope } from '@deepseek-ai/dsh-scope'
import JailbreakModeController, { foldJailbreakMode, type JailbreakModeConfig } from '../src/index.ts'
import { strategyById } from '../src/strategies.ts'
import { workspaceRoot, renderTvdSystem, scaffoldTvdWorkspace, DEFAULT_TVD_SUBDIR } from '../src/tvd.ts'

const tempDirs: string[] = []

async function agentWithSession(ctx: Context, id = 'agent-1', cwd?: string): Promise<Agent & { session: Session }> {
  const session = Session.create(
    SessionId(id),
    undefined,
    { version: 0, id: SessionId(id), createdAt: 0, isSeeded: false, ...(cwd !== undefined ? { cwd } : {}) },
  )
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

async function setup(config: JailbreakModeConfig = {}): Promise<{ ctx: Context; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-jb-tvd-'))
  tempDirs.push(dir)
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(LocalFileSystem, { cwd: dir })
  await ctx.plugin(JailbreakModeController, config)
  return { ctx, dir }
}

describe('workspaceRoot', () => {
  it('joins cwd, subdir, and strategy id', () => {
    expect(workspaceRoot('/work', 'tvd', 'tvd-guard')).toBe(join('/work', 'tvd', 'tvd-guard'))
  })

  it('honors a custom subdir', () => {
    expect(workspaceRoot('/work', 'hw', 'tvd-guard')).toBe(join('/work', 'hw', 'tvd-guard'))
  })
})

describe('scaffoldTvdWorkspace', () => {
  it('writes files into the workspace through the fs service and substitutes the model', async () => {
    const { ctx, dir } = await setup({ workspaceSubdir: 'tvd', validatorModel: 'meta-llama/LlamaGuard-2-8b' })
    const fs = ctx.fs
    const strategy = strategyById('tvd-guard')
    if (strategy?.tvd === undefined) throw new Error('tvd-guard must carry a tvd harness')
    const root = workspaceRoot(dir, 'tvd', strategy.id)
    await scaffoldTvdWorkspace(fs, root, strategy.tvd.files, { validatorModel: 'meta-llama/LlamaGuard-2-8b' })
    const guard = await readFile(join(root, 'guard.py'), 'utf8')
    expect(guard).toContain('meta-llama/LlamaGuard-2-8b')
    expect(guard).not.toContain('{{validatorModel}}')
    const testCase = await readFile(join(root, 'test_case.json'), 'utf8')
    expect(testCase).toContain('assistant_safe')
    expect(testCase).toContain('assistant_unsafe')
  })

  it('an empty validatorModel still writes the skeleton (strategy degrades, does not throw)', async () => {
    const { ctx, dir } = await setup({ workspaceSubdir: 'tvd', validatorModel: '' })
    const fs = ctx.fs
    const strategy = strategyById('tvd-guard')
    if (strategy?.tvd === undefined) throw new Error('tvd-guard must carry a tvd harness')
    const root = workspaceRoot(dir, 'tvd', strategy.id)
    await expect(scaffoldTvdWorkspace(fs, root, strategy.tvd.files, { validatorModel: '' })).resolves.toBeUndefined()
    const guard = await readFile(join(root, 'guard.py'), 'utf8')
    expect(guard).toContain('validatorModel is not configured')
  })
})

describe('tvd integration', () => {
  it('renders the workspace path and task into the system block for a tvd strategy', async () => {
    const { ctx, dir } = await setup({ workspaceSubdir: 'tvd', validatorModel: 'meta-llama/LlamaGuard-2-8b' })
    const agent = await agentWithSession(ctx, 'tvd-agent', dir)
    agent.session.append('jailbreak/mode', { active: true, strategy: 'tvd-guard' })
    const assembly = await assembleFor(ctx, agent)
    const policy = assembly.sections.find(section => section.name === 'jailbreak:policy')
    expect(policy?.text).toContain(dir)
    expect(policy?.text).toContain('python guard.py')
    expect(policy?.text).toContain('assistant_unsafe')
  })

  it('active tvd-guard scaffolds the workspace on the first pre-step and wraps no messages', async () => {
    const { ctx, dir } = await setup({ workspaceSubdir: 'tvd', validatorModel: 'meta-llama/LlamaGuard-2-8b' })
    const agent = await agentWithSession(ctx, 'tvd-step', dir)
    agent.session.append('jailbreak/mode', { active: true, strategy: 'tvd-guard' })
    const events = agentEvents(ctx, agent)
    const message = { content: [{ type: 'text', text: 'finish the task' }] } as unknown as UserMessage
    const signal = new AbortController().signal
    const decision = await events.waterfall(
      'agent/pre-step',
      { messages: [message], turn: 1, step: 1, signal },
      () => Promise.resolve({ kind: 'enter' as const, messages: [message] }),
    )
    if (decision.kind === 'reject') throw new Error('pre-step must enter for an accepted message')
    // tvd-guard carries empty prefix/suffix, so user messages are not wrapped.
    expect(decision.messages[0]?.content[0]).toEqual({ type: 'text', text: 'finish the task' })
    const guard = await readFile(join(dir, DEFAULT_TVD_SUBDIR, 'tvd-guard', 'guard.py'), 'utf8')
    expect(guard).toContain('meta-llama/LlamaGuard-2-8b')
  })

  it('defaultActive with a tvd strategy scaffolds for newly created agents', async () => {
    const { ctx, dir } = await setup({ defaultActive: true, defaultStrategy: 'tvd-guard', validatorModel: 'meta-llama/LlamaGuard-2-8b' })
    const agent = await agentWithSession(ctx, 'tvd-default', dir)
    expect(foldJailbreakMode(agent.session.snapshotEvents())).toEqual({ active: true, strategy: 'tvd-guard' })
    const events = agentEvents(ctx, agent)
    const message = { content: [{ type: 'text', text: 'go' }] } as unknown as UserMessage
    const signal = new AbortController().signal
    const decision = await events.waterfall(
      'agent/pre-step',
      { messages: [message], turn: 1, step: 1, signal },
      () => Promise.resolve({ kind: 'enter' as const, messages: [message] }),
    )
    if (decision.kind === 'reject') throw new Error('pre-step must enter for an accepted message')
    const guard = await readFile(join(dir, DEFAULT_TVD_SUBDIR, 'tvd-guard', 'guard.py'), 'utf8')
    expect(guard).toContain('meta-llama/LlamaGuard-2-8b')
  })

  it('scaffolding is idempotent per session: a second pre-step does not rewrite the workspace', async () => {
    const { ctx, dir } = await setup({ workspaceSubdir: 'tvd', validatorModel: 'meta-llama/LlamaGuard-2-8b' })
    const agent = await agentWithSession(ctx, 'tvd-idem', dir)
    agent.session.append('jailbreak/mode', { active: true, strategy: 'tvd-guard' })
    const events = agentEvents(ctx, agent)
    const message = { content: [{ type: 'text', text: 'go' }] } as unknown as UserMessage
    const signal = new AbortController().signal
    const run = () => events.waterfall(
      'agent/pre-step',
      { messages: [message], turn: 1, step: 1, signal },
      () => Promise.resolve({ kind: 'enter' as const, messages: [message] }),
    )
    await run()
    const guardPath = join(dir, DEFAULT_TVD_SUBDIR, 'tvd-guard', 'guard.py')
    const first = await readFile(guardPath, 'utf8')
    await run()
    const second = await readFile(guardPath, 'utf8')
    expect(second).toBe(first)
  })

  it('a tvd agent without a session cwd scaffolds under process.cwd()', async () => {
    const { ctx, dir } = await setup({ workspaceSubdir: 'tvd', validatorModel: 'meta-llama/LlamaGuard-2-8b' })
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(dir)
    try {
      const agent = await agentWithSession(ctx, 'tvd-nocwd')
      agent.session.append('jailbreak/mode', { active: true, strategy: 'tvd-guard' })
      const events = agentEvents(ctx, agent)
      const message = { content: [{ type: 'text', text: 'go' }] } as unknown as UserMessage
      const signal = new AbortController().signal
      const decision = await events.waterfall(
        'agent/pre-step',
        { messages: [message], turn: 1, step: 1, signal },
        () => Promise.resolve({ kind: 'enter' as const, messages: [message] }),
      )
      if (decision.kind === 'reject') throw new Error('pre-step must enter for an accepted message')
      const guard = await readFile(join(dir, DEFAULT_TVD_SUBDIR, 'tvd-guard', 'guard.py'), 'utf8')
      expect(guard).toContain('meta-llama/LlamaGuard-2-8b')
    } finally {
      cwd.mockRestore()
    }
  })

  it('a scaffold failure degrades to the prompt-only variant and is marked attempted', async () => {
    const { ctx, dir } = await setup({ workspaceSubdir: 'tvd', validatorModel: 'meta-llama/LlamaGuard-2-8b' })
    // A file where the workspace directory should go forces the fs write to fail.
    await writeFile(join(dir, DEFAULT_TVD_SUBDIR), 'blocked')
    const warn = vi.spyOn(ctx.logger, 'warn')
    const agent = await agentWithSession(ctx, 'tvd-fail', dir)
    agent.session.append('jailbreak/mode', { active: true, strategy: 'tvd-guard' })
    const events = agentEvents(ctx, agent)
    const message = { content: [{ type: 'text', text: 'go' }] } as unknown as UserMessage
    const signal = new AbortController().signal
    const decision = await events.waterfall(
      'agent/pre-step',
      { messages: [message], turn: 1, step: 1, signal },
      () => Promise.resolve({ kind: 'enter' as const, messages: [message] }),
    )
    if (decision.kind === 'reject') throw new Error('pre-step must enter for an accepted message')
    expect(warn).toHaveBeenCalled()
    // Prompt-only degradation: the step still enters with messages unwrapped.
    expect(decision.messages[0]?.content[0]).toEqual({ type: 'text', text: 'go' })
  })
})

describe('renderTvdSystem', () => {
  it('returns the plain system text for a non-TVD strategy', () => {
    const strategy = strategyById('dan')
    if (strategy === undefined) throw new Error('dan must exist')
    expect(renderTvdSystem(strategy, '/unused')).toBe(strategy.system)
  })
})

afterEach(async () => {
  await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })))
  tempDirs.length = 0
})
