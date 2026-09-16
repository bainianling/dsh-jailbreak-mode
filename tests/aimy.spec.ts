/**
 * Tests for the bundled aimy-skill support: path resolution from the plugin's
 * own location, the relocation override, and the rendered system block.
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AIMY_SKILL_DIR_ENV,
  AIMY_SKILL_COMMAND_COUNT,
  AIMY_SKILL_SKILL_COUNT,
  AIMY_SKILL_TOOL_COUNT,
  renderAimySkillSystem,
  resolveAimySkillPaths,
} from '../src/aimy.ts'
import { JAILBREAK_STRATEGIES, strategyById } from '../src/strategies.ts'

const env = (value: string): NodeJS.ProcessEnv => ({ [AIMY_SKILL_DIR_ENV]: value }) as NodeJS.ProcessEnv

describe('aimy-skill bundle resolution', () => {
  it('resolves the bundle to the checked-in assets directory', () => {
    const paths = resolveAimySkillPaths({})
    expect(statSync(paths.root).isDirectory()).toBe(true)
    expect(existsSync(paths.index)).toBe(true)
    // The index sits beside the bundle rather than inside it, so the vendored
    // tree stays byte-identical to upstream.
    expect(paths.index.startsWith(paths.root)).toBe(false)
  })

  it('honors DSH_AIMY_SKILL_DIR as the bundle root', () => {
    const paths = resolveAimySkillPaths(env(process.cwd()))
    expect(paths.root).toBe(process.cwd())
    expect(paths.index.endsWith('aimy-skill-index.md')).toBe(true)
  })

  it('ignores a blank override and falls back to the packaged location', () => {
    for (const blank of ['', '   ']) {
      const paths = resolveAimySkillPaths(env(blank))
      expect(existsSync(join(paths.root, 'main.py'))).toBe(true)
    }
  })

  it('ships the whole upstream tree', () => {
    const paths = resolveAimySkillPaths({})
    expect(existsSync(join(paths.root, 'main.py'))).toBe(true)
    expect(existsSync(join(paths.root, 'requirements.txt'))).toBe(true)
    expect(existsSync(join(paths.root, 'ai-mian/hack-skills/skills/hack/SKILL.md'))).toBe(true)
    expect(existsSync(join(paths.root, 'tools/sql_injection.py'))).toBe(true)
  })

  it('keeps the generated index and the exported counts in step', () => {
    const index = readFileSync(resolveAimySkillPaths({}).index, 'utf8')
    expect(index).toContain(`Attack Skills 提示词：**${AIMY_SKILL_SKILL_COUNT}** 个`)
    expect(index).toContain(`Python 工具模块：**${AIMY_SKILL_TOOL_COUNT}** 个`)
    expect(index).toContain(`CLI 子命令：**${AIMY_SKILL_COMMAND_COUNT}** 个`)
  })
})

describe('aimy-skill strategy', () => {
  const strategy = strategyById('aimy-skill')

  it('is registered with bundle metadata and no per-message wrapping', () => {
    expect(strategy?.aimy).toBeDefined()
    expect(strategy?.aimy?.version).toBe('3.7.0')
    expect(strategy?.prefix).toBe('')
    expect(strategy?.suffix).toBe('')
    expect(strategy?.category).toBe('security-toolkit')
    expect(JAILBREAK_STRATEGIES.some(entry => entry.id === 'aimy-skill')).toBe(true)
  })

  it('agrees with the exported bundle constants', () => {
    expect(strategy?.aimy?.skillCount).toBe(AIMY_SKILL_SKILL_COUNT)
    expect(strategy?.aimy?.toolCount).toBe(AIMY_SKILL_TOOL_COUNT)
    expect(strategy?.aimy?.commandCount).toBe(AIMY_SKILL_COMMAND_COUNT)
  })

  it('renders absolute paths and the reading order into the system block', () => {
    const paths = resolveAimySkillPaths({})
    const text = renderAimySkillSystem(strategy!, paths)
    expect(text).toContain(strategy!.system)
    // The root is rendered with a trailing separator so the model can join a
    // bare filename onto it without guessing.
    expect(text).toContain(`Bundled toolkit root: ${paths.root}`)
    expect(text).toContain(`Generated index: ${paths.index}`)
    expect(text).toContain('ai-mian/hack-skills/skills/<name>/SKILL.md')
    expect(text).toContain('Reading order:')
    expect(text).toContain('requirements.txt')
  })

  it('falls back to the plain system block when no bundle is attached', () => {
    const plain = { id: 'x', name: 'X', description: 'd', system: 'S', prefix: '', suffix: '' }
    expect(renderAimySkillSystem(plain, resolveAimySkillPaths({}))).toBe('S')
  })
})
