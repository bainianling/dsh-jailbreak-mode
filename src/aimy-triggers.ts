/**
 * Automatic skill selection for the bundled aimy-skill toolkit.
 *
 * The `aimy-skill` strategy ships 102 Attack Skill prompts. Telling the model
 * where they live is not the same as getting the relevant one in front of it:
 * a model that has to decide to go read a directory frequently does not, and
 * the decision is invisible. This module makes the selection deterministic.
 *
 * The chain is:
 *
 * 1. {@link loadAimyTriggerIndex} reads `assets/aimy-skill-triggers.json`, which
 *    `scripts/generate-aimy-triggers.mjs` derives from the vendored tree — the
 *    skills, their categories, their companion documents and their trigger
 *    words all come from disk, so a re-vendor cannot leave this stale.
 * 2. {@link matchAimySkills} scores the step's own user text against those
 *    triggers. A `strong` hit (the skill's full name, or a curated alias such
 *    as `sqli` / `sql注入`) weighs enough to route on its own; `weak` hits are
 *    the individual words of a directory name and must accumulate.
 * 3. {@link renderAimySkillInjection} wraps the winning `SKILL.md` for
 *    injection as instructions context.
 *
 * Everything here is pure or read-only: no network, no writes, no execution of
 * the toolkit's Python. Failures return `undefined` so a caller degrades to the
 * prompt-only strategy rather than failing a step.
 *
 * @module @bainianling/dsh-jailbreak-mode/aimy-triggers
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-llm'
import type { AimySkillPaths } from './aimy.js'

/** Most skills one step may auto-load, regardless of how many match. */
export const AIMY_INJECTION_MAX_SKILLS = 2

/**
 * Ceiling on the total injected characters per step. The largest single
 * `SKILL.md` is ~31 KB; the cap keeps a verbose match from crowding out the
 * user's own request. An over-budget skill is truncated with a pointer to its
 * absolute path rather than dropped.
 */
export const AIMY_INJECTION_CHAR_BUDGET = 48_000

/** One skill's routing record, as generated from the vendored tree. */
export interface AimyTriggerEntry {
  /** Directory name under `skills/`, and the skill's identity. */
  readonly name: string
  /** Upstream category id from `categories.yaml`. */
  readonly category: string
  /** The `description` field of the skill's frontmatter. */
  readonly description: string
  /** `SKILL.md` location, relative to the bundle root. */
  readonly path: string
  /** Companion documents in the same directory, when any. */
  readonly companions?: readonly string[]
  /** Decisive triggers: the full name plus curated aliases. */
  readonly strong: readonly string[]
  /** Supporting triggers: single name words, decisive only in combination. */
  readonly weak?: readonly string[]
}

/** The whole generated index. Weighting travels with the data, not in code. */
export interface AimyTriggerIndex {
  /** Upstream toolkit version the index was generated from. */
  readonly version: string
  /** Upstream commit the vendored tree was taken from. */
  readonly commit: string
  /** Number of skills, matching the vendored tree. */
  readonly skillCount: number
  /** Score contributed by one `strong` hit. */
  readonly strongWeight: number
  /** Score contributed by one `weak` hit. */
  readonly weakWeight: number
  /** Minimum score for a skill to be selected. */
  readonly threshold: number
  /** Every skill, sorted by name. */
  readonly skills: readonly AimyTriggerEntry[]
}

/** One selected skill and the evidence that selected it. */
export interface AimySkillMatch {
  /** The matched routing record. */
  readonly entry: AimyTriggerEntry
  /** Accumulated trigger weight. */
  readonly score: number
  /** The triggers that fired, strongest first. */
  readonly hits: readonly string[]
}

/**
 * Durable record of one automatic skill selection. The names ride the source so
 * a later step can see what has already been put in front of the model without
 * re-reading the injected prose.
 */
export interface AimySkillInjectionSource {
  readonly kind: 'aimy-skill'
  readonly form: 'instructions'
  /** Exactly the skills this message injected, in injection order. */
  readonly names: readonly string[]
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'aimy-skill': AimySkillInjectionSource
  }
}

/** Index files already read, so a step does not re-parse the same JSON. */
const INDEX_CACHE = new Map<string, AimyTriggerIndex | undefined>()

/** Compiled trigger patterns, keyed by trigger text. */
const PATTERN_CACHE = new Map<string, RegExp>()

/**
 * How many skills may share a declared-strong trigger before it stops being
 * decisive. Counted from the index itself rather than curated by hand: a word
 * that names a *class* of bug (`api`, `auth`, `injection`) is listed by many
 * skills and must not pick one of them on its own, while `sqli` or `sql注入`
 * belongs to exactly one and can.
 */
const GENERIC_SHARED_BY = 3

/**
 * Triggers that cannot route alone, however many skills claim them.
 *
 * These are the words that name *what kind of thing* a playbook is about rather
 * than which technique it covers: `type`, `path`, `open`, `logic`, `shell`.
 * They are too common in ordinary prose to be decisive ("what type of file is
 * this?" must not load the type-juggling playbook), yet each is claimed by only
 * one or two skills, so {@link GENERIC_SHARED_BY} cannot catch them. Function
 * words that survive as name fragments (`to`, from
 * `arbitrary-write-to-rce`) belong here for the same reason, with more force.
 *
 * The generator's own lexical split is a first pass; this set is applied by the
 * matcher and is the authority for what the matcher will act on, so a re-vendor
 * that changes the trigger table cannot silently promote one of these back to
 * decisive.
 */
const NON_DISTINCTIVE_TRIGGERS: ReadonlySet<string> = new Set([
  // Class nouns: categories of bug, not targets.
  'type', 'shell', 'reverse', 'memory', 'traffic', 'logic', 'path', 'open',
  'juggling', 'blind', 'error', 'union', 'stack', 'heap', 'cache', 'table',
  'overflow', 'access', 'code', 'file', 'files', 'test', 'tools',
  // Function words and bare verbs that leak in from a skill's name.
  'to', 'write', 'read', 'arbitrary', 'and', 'the', 'for', 'with', 'when',
  'use', 'used', 'using', 'into', 'from', 'common', 'basic', 'other', 'misc',
])

/** Per-index set of shared triggers, computed once per parsed index. */
const GENERIC_CACHE = new WeakMap<AimyTriggerIndex, ReadonlySet<string>>()

/** File name of the generated trigger index, used only when relocating a bundle. */
const TRIGGERS_FILE = 'aimy-skill-triggers.json'

/**
 * Absolute path of the generated trigger index for a resolved bundle.
 *
 * Both generated indexes sit beside the bundle rather than inside it, so the
 * vendored tree stays byte-identical to upstream. {@link AimySkillPaths} already
 * carries the location, so this is a field read — the constant exists only to
 * keep that layout in one place.
 *
 * @param paths - the resolved bundle location.
 * @returns Absolute path of the trigger index JSON.
 */
export function aimyTriggersPath(paths: AimySkillPaths): string {
  return paths.triggers.length > 0 ? paths.triggers : join(dirname(paths.index), TRIGGERS_FILE)
}

/**
 * Read and validate the generated trigger index.
 *
 * A missing or malformed index is not an error: the caller keeps the
 * prompt-only behavior. The verdict is cached per path, including the failure,
 * so a broken install does not re-read on every step.
 *
 * @param paths - the resolved bundle location.
 * @returns The parsed index, or `undefined` when it is absent or unusable.
 */
export function loadAimyTriggerIndex(paths: AimySkillPaths): AimyTriggerIndex | undefined {
  const file = aimyTriggersPath(paths)
  const cached = INDEX_CACHE.get(file)
  if (cached !== undefined || INDEX_CACHE.has(file)) return cached
  let parsed: AimyTriggerIndex | undefined
  try {
    parsed = parseAimyTriggerIndex(JSON.parse(readFileSync(file, 'utf8')) as unknown)
  } catch {
    parsed = undefined
  }
  INDEX_CACHE.set(file, parsed)
  return parsed
}

/**
 * Validate an untrusted parsed value into an {@link AimyTriggerIndex}.
 *
 * The shape is checked field by field because the index is generated data:
 * a schema drift should disable auto-selection, not crash a step.
 *
 * @param raw - the parsed JSON value.
 * @returns The validated index, or `undefined` when the shape does not hold.
 */
export function parseAimyTriggerIndex(raw: unknown): AimyTriggerIndex | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const value = raw as Record<string, unknown>
  const { version, commit, skillCount, strongWeight, weakWeight, threshold, skills } = value
  if (typeof version !== 'string' || typeof commit !== 'string') return undefined
  if (!isPositiveInteger(skillCount) || !isPositiveInteger(strongWeight)) return undefined
  if (!isPositiveInteger(weakWeight) || !isPositiveInteger(threshold)) return undefined
  if (!Array.isArray(skills) || skills.length !== skillCount) return undefined
  const entries: AimyTriggerEntry[] = []
  for (const item of skills) {
    if (typeof item !== 'object' || item === null) return undefined
    const entry = item as Record<string, unknown>
    const { name, category, description, path, companions, strong, weak } = entry
    if (typeof name !== 'string' || name === '') return undefined
    if (typeof category !== 'string' || typeof description !== 'string') return undefined
    if (typeof path !== 'string' || path === '') return undefined
    if (!isStringArray(strong) || strong.length === 0) return undefined
    if (companions !== undefined && !isStringArray(companions)) return undefined
    if (weak !== undefined && !isStringArray(weak)) return undefined
    entries.push({
      name,
      category,
      description,
      path,
      ...(companions === undefined ? {} : { companions }),
      strong,
      ...(weak === undefined ? {} : { weak }),
    })
  }
  return { version, commit, skillCount, strongWeight, weakWeight, threshold, skills: entries }
}

/**
 * Score one step's text against the index and return the skills worth loading.
 *
 * Selection is deliberately conservative: a skill needs {@link
 * AimyTriggerIndex.threshold} points, which one `strong` hit satisfies alone but
 * a lone `weak` word never does. Ties break toward the more specific match — the
 * longer matched trigger wins — and then by name, so the result is stable.
 *
 * @param index - the generated trigger index.
 * @param text - the step's own user text (never injected content).
 * @param limit - maximum matches to return.
 * @param exclude - skill names already injected in this session.
 * @returns Matches, best first; empty when nothing clears the threshold.
 */
export function matchAimySkills(
  index: AimyTriggerIndex,
  text: string,
  limit: number = AIMY_INJECTION_MAX_SKILLS,
  exclude?: ReadonlySet<string>,
): AimySkillMatch[] {
  const haystack = text.toLowerCase()
  if (haystack.trim().length === 0) return []
  const generic = genericTriggers(index)
  const matches: AimySkillMatch[] = []
  for (const entry of index.skills) {
    if (exclude?.has(entry.name) === true) continue
    let score = 0
    let decisive = false
    const hits: string[] = []
    for (const trigger of entry.strong) {
      if (!fires(haystack, trigger)) continue
      // A shared trigger still counts, but at the weak weight and without
      // making the match decisive on its own.
      if (generic.has(trigger)) {
        score += index.weakWeight
      } else {
        score += index.strongWeight
        decisive = true
      }
      hits.push(trigger)
    }
    for (const trigger of entry.weak ?? []) {
      if (!fires(haystack, trigger)) continue
      score += index.weakWeight
      hits.push(trigger)
    }
    // The threshold must be cleared, and at least one trigger must name this
    // skill specifically: a pile of generic words is a topic, not a target.
    if (!decisive || score < index.threshold) continue
    hits.sort((a, b) => b.length - a.length || a.localeCompare(b))
    matches.push({ entry, score, hits })
  }
  matches.sort((a, b) => b.score - a.score
    || b.hits[0]!.length - a.hits[0]!.length
    || a.entry.name.localeCompare(b.entry.name))
  return matches.slice(0, limit)
}

/**
 * Triggers that cannot route alone, however many skills claim them.
 *
 * Two sources, deliberately combined: the count catches words shared across the
 * table (`api`, `auth`, `injection`), and {@link CLASS_NOUN_TRIGGERS} catches
 * bare class nouns that only one or two skills list yet still appear in
 * ordinary prose. Counting alone would miss the second kind; a curated list
 * alone would rot when the bundle is re-vendored, so the count carries the load
 * and the list covers the residue.
 *
 * @param index - the generated trigger index.
 * @returns The set of non-decisive triggers, computed once per index.
 */
export function genericTriggers(index: AimyTriggerIndex): ReadonlySet<string> {
  const cached = GENERIC_CACHE.get(index)
  if (cached !== undefined) return cached
  const counts = new Map<string, number>()
  for (const entry of index.skills) {
    for (const trigger of entry.strong) {
      counts.set(trigger, (counts.get(trigger) ?? 0) + 1)
    }
  }
  const generic = new Set<string>(NON_DISTINCTIVE_TRIGGERS)
  for (const [trigger, count] of counts) {
    if (count >= GENERIC_SHARED_BY) generic.add(trigger)
  }
  GENERIC_CACHE.set(index, generic)
  return generic
}

/**
 * Whether one trigger occurs in already-lowercased text.
 *
 * Triggers are matched on word boundaries so `type` cannot fire inside
 * `prototype`, with an optional English inflection suffix so `hack` still
 * matches `hacking`. CJK triggers need no boundary handling: the surrounding
 * characters are never `[a-z0-9]`, so the same pattern covers both scripts.
 *
 * @param haystack - lowercased step text.
 * @param trigger - one trigger word or phrase.
 * @returns Whether the trigger fires.
 */
function fires(haystack: string, trigger: string): boolean {
  // Necessary condition, and much cheaper than the pattern for the common miss.
  if (!haystack.includes(trigger)) return false
  let pattern = PATTERN_CACHE.get(trigger)
  if (pattern === undefined) {
    const escaped = trigger.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
    pattern = new RegExp(`(^|[^a-z0-9])${escaped}(?:s|es|ing|ed)?(?![a-z0-9])`)
    PATTERN_CACHE.set(trigger, pattern)
  }
  return pattern.test(haystack)
}

/**
 * Read one skill's `SKILL.md` from the bundle.
 *
 * @param paths - the resolved bundle location.
 * @param entry - the skill to read; `path` is relative to the bundle root.
 * @returns The file body, or `undefined` when it cannot be read.
 */
export function readAimySkill(paths: AimySkillPaths, entry: AimyTriggerEntry): string | undefined {
  try {
    return readFileSync(join(paths.root, entry.path), 'utf8')
  } catch {
    return undefined
  }
}

/**
 * Render one skill for injection as instructions context.
 *
 * The body is the upstream `SKILL.md` verbatim — the same text `tool-skill`
 * would inject for a `/<name>` gesture — framed by where it came from, where
 * the full file lives, and which companion documents exist. The frame is what
 * lets the model trust the injection and read further on its own.
 *
 * @param paths - the resolved bundle location.
 * @param entry - the skill being injected.
 * @param content - that skill's `SKILL.md` body.
 * @param reason - the triggers that selected it, rendered for the model.
 * @returns The injection text.
 */
export function renderAimySkillInjection(
  paths: AimySkillPaths,
  entry: AimyTriggerEntry,
  content: string,
  reason: string,
): string {
  const file = join(paths.root, entry.path)
  const companions = entry.companions ?? []
  return [
    `<aimy-skill name="${entry.name}" category="${entry.category}" selected="${reason}">`,
    content.trimEnd(),
    '</aimy-skill>',
    `Loaded automatically by jailbreak mode because the request matched: ${reason}.`,
    `Full file: ${file}`,
    ...companions.length === 0
      ? []
      : [`Companion documents beside it, to read only if this skill is not enough: ${companions.join(', ')}`],
  ].join('\n')
}

/** One rendered injection: the message text plus the names it put in context. */
export interface AimyInjection {
  readonly text: string
  readonly names: string[]
}

/**
 * Render the step's matched skills into one injectable block, honouring both
 * budgets.
 *
 * @param paths - the resolved bundle location.
 * @param matches - the selected skills, best first.
 * @param budget - maximum total characters to emit; defaults to {@link AIMY_INJECTION_CHAR_BUDGET}.
 * @returns The block and its names, or `undefined` when nothing could be read.
 */
export function renderAimyInjections(
  paths: AimySkillPaths,
  matches: readonly AimySkillMatch[],
  budget: number = AIMY_INJECTION_CHAR_BUDGET,
): AimyInjection | undefined {
  const parts: string[] = []
  const names: string[] = []
  let used = 0
  for (const match of matches) {
    const content = readAimySkill(paths, match.entry)
    if (content === undefined) continue
    const reason = match.hits.slice(0, 4).join(', ')
    const rendered = renderAimySkillInjection(paths, match.entry, content, reason)
    const remaining = budget - used
    if (remaining <= 0) break
    if (rendered.length > remaining) {
      // Truncation is explicit: the model is told the body was cut and where
      // the whole file is, rather than silently receiving half a playbook.
      const head = rendered.slice(0, Math.max(remaining - 200, 0))
      const file = join(paths.root, match.entry.path)
      parts.push(`${head}\n[truncated by jailbreak mode at the injection budget — read ${file} for the rest]`)
      names.push(match.entry.name)
      used = budget
      break
    }
    parts.push(rendered)
    names.push(match.entry.name)
    used += rendered.length
  }
  if (parts.length === 0) return undefined
  return { text: parts.join('\n\n'), names }
}

/**
 * Skill names already injected into this session, from its own durable log.
 *
 * This is what stops a skill from being re-injected on every step of a long
 * conversation: the injection is a logged `user/message` carrying its names.
 *
 * @param events - the session log.
 * @returns Every auto-loaded skill name, in first-seen order.
 */
export function injectedAimySkills(events: readonly SessionEvent[]): Set<string> {
  const names = new Set<string>()
  for (const event of events) {
    if (event.type !== 'user/message') continue
    const source = event.data.source
    if (source.kind !== 'aimy-skill') continue
    for (const name of source.names) names.add(name)
  }
  return names
}

/**
 * Render the whole index as a plain catalog, for the `aimy_skill` tool's `list`
 * action.
 *
 * @param index - the generated trigger index.
 * @param category - optional category filter.
 * @returns One line per skill: name, category, description.
 */
export function renderAimySkillCatalog(index: AimyTriggerIndex, category?: string): string {
  const wanted = category?.trim().toLowerCase()
  const skills = wanted === undefined || wanted === ''
    ? index.skills
    : index.skills.filter(entry => entry.category.toLowerCase() === wanted)
  if (skills.length === 0) {
    const known = [...new Set(index.skills.map(entry => entry.category))].sort()
    return `No skill in category "${category}". Known categories: ${known.join(', ')}`
  }
  return skills
    .map(entry => `${entry.name} [${entry.category}] — ${entry.description}`)
    .join('\n')
}

/**
 * Render one skill for the `aimy_skill` tool's `load` action: the full body plus
 * its absolute location.
 *
 * @param paths - the resolved bundle location.
 * @param entry - the skill to render.
 * @returns The rendered skill, or `undefined` when its file cannot be read.
 */
export function renderAimySkillLoad(paths: AimySkillPaths, entry: AimyTriggerEntry): string | undefined {
  const content = readAimySkill(paths, entry)
  if (content === undefined) return undefined
  return renderAimySkillInjection(paths, entry, content, 'requested explicitly')
}

/** Look one skill up by exact name. */
export function aimySkillByName(index: AimyTriggerIndex, name: string): AimyTriggerEntry | undefined {
  const wanted = name.trim().toLowerCase()
  return index.skills.find(entry => entry.name.toLowerCase() === wanted)
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}
