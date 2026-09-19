/**
 * The `aimy_skill` tool: explicit access to the bundled toolkit's 102 Attack
 * Skill prompts.
 *
 * Automatic selection (see `./aimy-triggers.js`) covers the common case, but a
 * model that already knows which skill it wants, or wants to browse by
 * category, should not have to guess a file path. This tool is the deterministic
 * counterpart: `list` enumerates the catalog, `search` ranks it against a query
 * using the same triggers as auto-selection, and `load` returns one skill's full
 * body.
 *
 * The tool reads only. It never runs the toolkit's Python and never writes, so
 * mounting it cannot cause a side effect on its own.
 *
 * @module @bainianling/dsh-jailbreak-mode/aimy-tool
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { AIMY_SKILL_UPSTREAM, type AimySkillPaths } from './aimy.js'
import {
  aimySkillByName,
  loadAimyTriggerIndex,
  matchAimySkills,
  renderAimySkillCatalog,
  renderAimySkillLoad,
  type AimyTriggerIndex,
} from './aimy-triggers.js'

/** Name under which the tool registers. */
export const AIMY_TOOL_NAME = 'aimy_skill'

/**
 * Build the `aimy_skill` tool over a resolved bundle.
 *
 * The index is read lazily on first call and cached inside `aimy-triggers`, so
 * building the tool is free and a bundle with a missing index degrades to an
 * explanatory error rather than a failed mount.
 *
 * @param paths - the resolved bundle location.
 * @returns A registry-ready tool definition.
 */
export function defineAimySkillTool(paths: AimySkillPaths) {
  return defineTool({
    name: AIMY_TOOL_NAME,
    description: [
      'Read the penetration-testing playbooks bundled with this plugin.',
      'Use action="list" to browse every playbook by category, action="search" to find the ones matching a query, and action="load" to read one in full before working on a task it covers.',
      'The playbooks are local files shipped inside the plugin; reading them needs no network access.',
    ].join(' '),
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['list', 'search', 'load'],
        description: 'list every playbook, search the catalog, or load one playbook body.',
      },
      query: {
        type: 'string',
        description: 'For action="search": what to look for, e.g. "sql injection" or "linux提权".',
      },
      name: {
        type: 'string',
        description: 'For action="load": the exact playbook name from the catalog.',
      },
      category: {
        type: 'string',
        description: 'For action="list": restrict to one category id, e.g. "injection".',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          action: { type: 'string', required: true },
          text: { type: 'string', required: true },
          names: { type: 'array', items: { type: 'string' } },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.text }],
    },
    async execute(args) {
      const index = loadAimyTriggerIndex(paths)
      if (index === undefined) {
        throw new Error(`the bundled skill index could not be read from "${paths.root}"; reinstall the plugin or set DSH_AIMY_SKILL_DIR to a complete toolkit checkout`)
      }
      switch (args.action) {
        case 'list':
          return { action: 'list', text: renderAimySkillCatalog(index, args.category), names: [] }
        case 'search':
          return search(index, paths, args.query)
        case 'load':
          return load(index, paths, args.name)
        /* v8 ignore next 2 -- the parameter enum makes other actions unreachable */
        default:
          throw new Error(`unknown action "${String(args.action)}"; expected list, search, or load`)
      }
    },
    presentCall(args) {
      const detail = args.action === 'load'
        ? args.name ?? ''
        : args.action === 'search' ? args.query ?? '' : args.category ?? ''
      return {
        card: 'generic',
        title: detail === '' ? `aimy_skill ${args.action}` : `aimy_skill ${args.action} ${detail}`,
        kind: 'read',
        rawInput: detail === '' ? args.action : `${args.action} ${detail}`,
      }
    },
  })
}

/** Rank the catalog against a free-text query using the auto-selection triggers. */
function search(
  index: AimyTriggerIndex,
  paths: AimySkillPaths,
  query: string | undefined,
): { action: string; text: string; names: string[] } {
  const text = query?.trim() ?? ''
  if (text.length === 0) throw new Error('action="search" needs a non-empty query')
  const matches = matchAimySkills(index, text, 8)
  if (matches.length === 0) {
    return {
      action: 'search',
      text: `No playbook matches "${text}". Use action="list" to browse all ${index.skillCount} by category.`,
      names: [],
    }
  }
  const lines = matches.map(match => `${match.entry.name} [${match.entry.category}] — matched ${match.hits.slice(0, 4).join(', ')} — ${match.entry.description}`)
  return {
    action: 'search',
    text: [
      `${matches.length} playbook(s) match "${text}", best first; call action="load" with an exact name to read one:`,
      ...lines,
      `Bodies live under ${paths.root}.`,
    ].join('\n'),
    names: matches.map(match => match.entry.name),
  }
}

/** Return one skill's full body by exact name. */
function load(
  index: AimyTriggerIndex,
  paths: AimySkillPaths,
  name: string | undefined,
): { action: string; text: string; names: string[] } {
  const wanted = name?.trim() ?? ''
  if (wanted.length === 0) throw new Error('action="load" needs a playbook name')
  const entry = aimySkillByName(index, wanted)
  if (entry === undefined) {
    const near = matchAimySkills(index, wanted, 5)
    const hint = near.length === 0
      ? 'Use action="list" to browse the catalog.'
      : `Closest names: ${near.map(match => match.entry.name).join(', ')}.`
    throw new Error(`no bundled playbook named "${wanted}". ${hint}`)
  }
  const text = renderAimySkillLoad(paths, entry)
  if (text === undefined) {
    throw new Error(`playbook "${entry.name}" is listed in the index but its file is missing from "${paths.root}"`)
  }
  return {
    action: 'load',
    text: `${text}\n\nSource: ${AIMY_SKILL_UPSTREAM} (bundled toolkit ${index.version}).`,
    names: [entry.name],
  }
}
