/**
 * Tests for automatic bundled-skill selection: the generated trigger index, the
 * scoring that picks skills, the rendering that injects them, and the durable
 * record that stops a skill from being injected twice.
 */

import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { resolveAimySkillPaths } from '../src/aimy.ts'
import {
  AIMY_INJECTION_CHAR_BUDGET,
  aimySkillByName,
  aimyTriggersPath,
  genericTriggers,
  injectedAimySkills,
  loadAimyTriggerIndex,
  matchAimySkills,
  parseAimyTriggerIndex,
  readAimySkill,
  renderAimyInjections,
  renderAimySkillCatalog,
  renderAimySkillInjection,
  renderAimySkillLoad,
  type AimyTriggerIndex,
} from '../src/aimy-triggers.ts'

const paths = resolveAimySkillPaths({})

/** A tiny hand-built index, so scoring tests do not depend on the shipped data. */
function fixtureIndex(): AimyTriggerIndex {
  return {
    version: '0.0.0',
    commit: 'test',
    skillCount: 2,
    strongWeight: 3,
    weakWeight: 1,
    threshold: 3,
    skills: [
      {
        name: 'sqli-sql-injection',
        category: 'injection',
        description: 'SQL injection playbook',
        path: 'ai-mian/hack-skills/skills/sqli-sql-injection/SKILL.md',
        strong: ['sqli', 'sql注入'],
        weak: ['injection'],
      },
      {
        name: 'xss-cross-site-scripting',
        category: 'injection',
        description: 'XSS playbook',
        path: 'ai-mian/hack-skills/skills/xss-cross-site-scripting/SKILL.md',
        strong: ['xss'],
        weak: ['cross', 'site'],
      },
    ],
  }
}

describe('aimy trigger index', () => {
  it('derives the trigger index from the resolved bundle layout', () => {
    const index = loadAimyTriggerIndex(paths)
    expect(index).toBeDefined()
    expect(index!.skillCount).toBe(102)
    expect(index!.skills).toHaveLength(102)
    // The index is generated data and must agree with the tree it describes.
    expect(index!.skills.every(entry => entry.strong.length > 0)).toBe(true)
    expect(aimyTriggersPath(paths)).toBe(paths.triggers)
    expect(paths.triggers.endsWith('aimy-skill-triggers.json')).toBe(true)
    // Both generated indexes sit beside the bundle, never inside it, so the
    // vendored tree stays byte-identical to upstream.
    expect(paths.triggers.startsWith(paths.root)).toBe(false)
  })

  it('caches the parsed index per path', () => {
    expect(loadAimyTriggerIndex(paths)).toBe(loadAimyTriggerIndex(paths))
  })

  it('returns undefined for a missing index rather than throwing', () => {
    expect(loadAimyTriggerIndex({ ...paths, triggers: join(paths.root, 'no-such.json') })).toBeUndefined()
    expect(loadAimyTriggerIndex({ ...paths, triggers: paths.root })).toBeUndefined()
  })

  it('rejects a malformed index instead of routing on it', () => {
    expect(parseAimyTriggerIndex(null)).toBeUndefined()
    expect(parseAimyTriggerIndex({})).toBeUndefined()
    // skillCount disagreeing with the array is exactly the drift that must not route.
    expect(parseAimyTriggerIndex({
      version: '1', commit: 'c', skillCount: 5, strongWeight: 3, weakWeight: 1, threshold: 3, skills: [],
    })).toBeUndefined()
    expect(parseAimyTriggerIndex({
      version: '1', commit: 'c', skillCount: 1, strongWeight: 3, weakWeight: 1, threshold: 3,
      skills: [{ name: 'a', category: 'b', description: 'd', path: 'p', strong: [] }],
    })).toBeUndefined()
  })
})

describe('matchAimySkills', () => {
  const index = fixtureIndex()

  it('routes on a single strong trigger', () => {
    const matches = matchAimySkills(index, 'please test this endpoint for sqli')
    expect(matches).toHaveLength(1)
    expect(matches[0]!.entry.name).toBe('sqli-sql-injection')
    expect(matches[0]!.score).toBe(3)
  })

  it('routes on a Chinese trigger', () => {
    const matches = matchAimySkills(index, '这个站有sql注入吗')
    expect(matches[0]!.entry.name).toBe('sqli-sql-injection')
  })

  it('never routes on a single weak trigger', () => {
    // `injection` alone is a class of bug, not a target.
    expect(matchAimySkills(index, 'look for injection here')).toEqual([])
  })

  it('never routes on weak triggers alone, however many accumulate', () => {
    const matches = matchAimySkills(index, 'the cross site scripting bits')
    // cross + site = 2, still below 3, and neither is decisive.
    expect(matches).toEqual([])
    const withStrong = matchAimySkills(index, 'xss cross site scripting')
    expect(withStrong[0]!.entry.name).toBe('xss-cross-site-scripting')
  })

  it('matches on word boundaries, not substrings', () => {
    const boundary: AimyTriggerIndex = { ...index, skills: [{ ...index.skills[0]!, strong: ['xss'] }] }
    expect(matchAimySkills(boundary, 'an xxss payload')).toEqual([])
    expect(matchAimySkills(boundary, 'a reflected xss here')).toHaveLength(1)
  })

  it('treats a bare class noun as non-decisive even when one skill lists it', () => {
    const noun: AimyTriggerIndex = { ...index, skills: [{ ...index.skills[0]!, strong: ['type'] }] }
    // `type` names a class of bug, not a target: it must not pick a playbook.
    expect([...genericTriggers(noun)].includes('type')).toBe(true)
    expect(matchAimySkills(noun, 'what type of file is this')).toEqual([])
  })

  it('accepts common inflections of a strong trigger', () => {
    const hackIndex: AimyTriggerIndex = { ...index, skills: [{ ...index.skills[0]!, strong: ['hack'] }] }
    expect(matchAimySkills(hackIndex, 'hacking a box')).toHaveLength(1)
  })

  it('ignores excluded names, honours the limit, and is stable', () => {
    const both = matchAimySkills(index, 'sqli and xss', 2)
    expect(both).toHaveLength(2)
    expect(matchAimySkills(index, 'sqli', 1, new Set(['sqli-sql-injection']))).toEqual([])
    expect(matchAimySkills(index, '', 2)).toEqual([])
  })

  it('reports the triggers that fired, longest first', () => {
    const matches = matchAimySkills(index, 'sqli sql注入')
    expect(matches[0]!.hits[0]).toBe('sql注入')
    expect(matches[0]!.hits).toContain('sqli')
  })

  it('demotes a trigger shared by many skills so it cannot route alone', () => {
    const shared: AimyTriggerIndex = {
      ...index,
      skillCount: 3,
      skills: [
        { ...index.skills[0]!, name: 'a', strong: ['api'] },
        { ...index.skills[0]!, name: 'b', strong: ['api'] },
        { ...index.skills[0]!, name: 'c', strong: ['api'] },
      ],
    }
    expect(genericTriggers(shared).has('api')).toBe(true)
    // Every skill lists `api`, so a request naming only that is a topic, not a
    // target: nothing may be selected.
    expect(matchAimySkills(shared, 'look at the api')).toEqual([])
  })

  it('a shared trigger still contributes once a decisive one fires', () => {
    const mixed: AimyTriggerIndex = {
      ...index,
      skillCount: 3,
      skills: [
        { ...index.skills[0]!, name: 'a', strong: ['api', 'sqli'] },
        { ...index.skills[0]!, name: 'b', strong: ['api'] },
        { ...index.skills[0]!, name: 'c', strong: ['api'] },
      ],
    }
    const matches = matchAimySkills(mixed, 'api sqli')
    expect(matches).toHaveLength(1)
    expect(matches[0]!.entry.name).toBe('a')
    // `api` counts at the weak weight, `sqli` at the strong weight.
    expect(matches[0]!.score).toBe(4)
  })

  it('finds the shared triggers in the shipped index', () => {
    const real = loadAimyTriggerIndex(paths)!
    const shared = genericTriggers(real)
    // `api` names four different api-* playbooks; it must never pick one alone.
    expect(shared.has('api')).toBe(true)
    // A trigger belonging to exactly one playbook stays decisive.
    expect(shared.has('sql注入')).toBe(false)
    expect(shared.has('sqli-sql-injection')).toBe(false)
    expect(matchAimySkills(real, 'sql注入')[0]?.entry.name).toBe('sqli-sql-injection')
  })

  it('never lets a leaked function word route, in the shipped index', () => {
    const real = loadAimyTriggerIndex(paths)!
    // `to` is a fragment of `arbitrary-write-to-rce`'s name and appears in
    // almost every English sentence; the shipped data declares it `strong`.
    expect(real.skills.some(entry => entry.strong.includes('to'))).toBe(true)
    const generic = genericTriggers(real)
    expect(generic.has('to')).toBe(true)
    expect(generic.has('api')).toBe(true)
    // With a real signal present the same playbook still loads: demotion
    // lowers a trigger's weight, it does not remove the skill from routing.
    const names = matchAimySkills(real, 'turn this arbitrary write into rce').map(match => match.entry.name)
    expect(names).toContain('arbitrary-write-to-rce')
  })
})

describe('aimy injection rendering', () => {
  const index = fixtureIndex()

  it('reads a real skill body from the bundle', () => {
    const entry = aimySkillByName(loadAimyTriggerIndex(paths)!, 'sqli-sql-injection')!
    const body = readAimySkill(paths, entry)
    expect(body).toBeDefined()
    expect(body!.length).toBeGreaterThan(100)
    expect(readAimySkill(paths, { ...entry, path: 'missing/SKILL.md' })).toBeUndefined()
  })

  it('frames the body with its origin, its path, and its companions', () => {
    const entry = aimySkillByName(loadAimyTriggerIndex(paths)!, 'sqli-sql-injection')!
    const text = renderAimySkillInjection(paths, entry, '# body', 'sqli')
    expect(text).toContain('<aimy-skill name="sqli-sql-injection" category="injection" selected="sqli">')
    expect(text).toContain('# body')
    expect(text).toContain('</aimy-skill>')
    expect(text).toContain('Loaded automatically by jailbreak mode')
    // The absolute path is what lets the model read the rest without guessing.
    expect(text).toContain(paths.root)
    expect(text).toContain('SKILL.md')
  })

  it('names companion documents when the skill has them', () => {
    const entry = aimySkillByName(loadAimyTriggerIndex(paths)!, 'sqli-sql-injection')!
    expect(renderAimySkillInjection(paths, entry, 'b', 'r')).toContain('Companion documents beside it')
    const bare = { ...entry, companions: undefined }
    expect(renderAimySkillInjection(paths, bare, 'b', 'r')).not.toContain('Companion documents')
  })

  it('renders matched skills into one injectable block', () => {
    const real = loadAimyTriggerIndex(paths)!
    const matches = matchAimySkills(real, 'sql注入 and xss', 2)
    const injection = renderAimyInjections(paths, matches)
    expect(injection).toBeDefined()
    expect(injection!.names).toHaveLength(matches.length)
    expect(injection!.text).toContain('<aimy-skill')
  })

  it('truncates explicitly at the budget rather than silently', () => {
    const real = loadAimyTriggerIndex(paths)!
    const matches = matchAimySkills(real, 'sql注入', 1)
    const tiny = renderAimyInjections(paths, matches, 400)
    expect(tiny).toBeDefined()
    expect(tiny!.text).toContain('truncated by jailbreak mode at the injection budget')
  })

  it('returns undefined when nothing can be read', () => {
    expect(renderAimyInjections(paths, [])).toBeUndefined()
    const real = loadAimyTriggerIndex(paths)!
    const matches = matchAimySkills(real, 'sql注入', 1)
    const broken = matches.map(match => ({ ...match, entry: { ...match.entry, path: 'nope/SKILL.md' } }))
    expect(renderAimyInjections(paths, broken)).toBeUndefined()
  })

  it('keeps the shipped budget above one full skill so a single match never truncates', () => {
    const real = loadAimyTriggerIndex(paths)!
    const largest = real.skills.reduce((best, entry) => {
      const size = readAimySkill(paths, entry)?.length ?? 0
      return size > best ? size : best
    }, 0)
    expect(AIMY_INJECTION_CHAR_BUDGET).toBeGreaterThan(largest)
  })
})

describe('durable injection record', () => {
  it('collects injected names from the session log', () => {
    const session = Session.create(SessionId('aimy-log'))
    expect(injectedAimySkills(session.snapshotEvents()).size).toBe(0)
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'x' }],
      source: { kind: 'aimy-skill', form: 'instructions', names: ['sqli-sql-injection', 'xss-cross-site-scripting'] },
    }), { surfaceOp: 'append' })
    const names = injectedAimySkills(session.snapshotEvents())
    expect([...names]).toEqual(['sqli-sql-injection', 'xss-cross-site-scripting'])
  })
})

describe('aimy_skill tool payload rendering', () => {
  it('renders the catalog, filters by category, and reports an unknown one', () => {
    const index = loadAimyTriggerIndex(paths)!
    expect(renderAimySkillCatalog(index).split('\n')).toHaveLength(102)
    const injection = renderAimySkillCatalog(index, 'injection').split('\n')
    expect(injection.length).toBeGreaterThan(10)
    expect(injection.every(line => line.includes('[injection]'))).toBe(true)
    expect(renderAimySkillCatalog(index, 'nope')).toContain('No skill in category "nope". Known categories:')
  })

  it('loads one skill by exact name and refuses an unknown one', () => {
    const index = loadAimyTriggerIndex(paths)!
    const entry = aimySkillByName(index, 'XSS-Cross-Site-Scripting')
    expect(entry?.name).toBe('xss-cross-site-scripting')
    expect(aimySkillByName(index, 'nope')).toBeUndefined()
    const text = renderAimySkillLoad(paths, entry!)
    expect(text).toContain('<aimy-skill name="xss-cross-site-scripting"')
    expect(renderAimySkillLoad(paths, { ...entry!, path: 'missing/SKILL.md' })).toBeUndefined()
  })
})
