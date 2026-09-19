/**
 * Built-in `aimy-skill` bundle support for the jailbreak `aimy-skill` strategy.
 *
 * The strategy ships the upstream AI-native penetration-testing toolkit
 * (<https://github.com/Prohao42/aimy-skill>, MIT) verbatim inside this package
 * under `assets/aimy-skill/`, plus a generated index at
 * `assets/aimy-skill-index.md`. This module resolves that bundle's absolute
 * location from the plugin's own module URL — not from the session cwd — so the
 * path is identical no matter which workspace a session runs in, and renders
 * the system block that tells the model where the toolkit is and how to use it.
 *
 * Resolution is a pure function of the plugin file location: the published
 * package layout is fixed by the `files` list, so no filesystem probe is needed.
 *
 * @module @bainianling/dsh-jailbreak-mode/aimy
 */

import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { JailbreakStrategy } from './strategies.js'

/** Path of the built-in toolkit inside the package, relative to the package root. */
export const AIMY_SKILL_DIR = 'assets/aimy-skill'

/** Path of the generated bundle index inside the package, relative to the package root. */
export const AIMY_SKILL_INDEX = 'assets/aimy-skill-index.md'

/** Path of the generated trigger index inside the package, relative to the package root. */
export const AIMY_SKILL_TRIGGERS = 'assets/aimy-skill-triggers.json'

/** Environment variable that relocates the bundle (a checkout, or an unpacked copy). */
export const AIMY_SKILL_DIR_ENV = 'DSH_AIMY_SKILL_DIR'

/** Upstream repository the bundle is copied from. */
export const AIMY_SKILL_UPSTREAM = 'https://github.com/Prohao42/aimy-skill'

/** Upstream toolkit version vendored into this package. */
export const AIMY_SKILL_VERSION = '3.7.0'

/** Upstream commit the vendored tree was taken from. */
export const AIMY_SKILL_COMMIT = '0c56eb161a10ce5fdea103cf8b92ced9a8f51e66'

/** Number of Attack Skill prompts shipped in the bundle. */
export const AIMY_SKILL_SKILL_COUNT = 102

/** Number of Python tool modules shipped in the bundle. */
export const AIMY_SKILL_TOOL_COUNT = 136

/** Number of top-level CLI commands shipped in the bundle. */
export const AIMY_SKILL_COMMAND_COUNT = 87

/** Package root: `lib/aimy.js` and `src/aimy.ts` both sit one level below it. */
const PACKAGE_ROOT = new URL('../', import.meta.url)

/**
 * A resolved bundle location. Every path is absolute; whether the directory
 * actually exists is the deployment's business, so callers only render them.
 */
export interface AimySkillPaths {
  /** Absolute path of the toolkit root, containing `main.py` and `tools/`. */
  readonly root: string
  /** Absolute path of the generated index document. */
  readonly index: string
  /** Absolute path of the generated trigger index used for automatic selection. */
  readonly triggers: string
}

/**
 * Resolve the bundle's absolute root and index paths.
 *
 * A non-empty `DSH_AIMY_SKILL_DIR` wins, so a deployment can relocate the bundle
 * (this repository's own checkout, or an unpacked copy); otherwise both paths
 * derive from the plugin's module URL and hold for any install layout.
 *
 * @param env - environment map to read the override from; defaults to `process.env`.
 * @returns Absolute toolkit root and index paths.
 */
export function resolveAimySkillPaths(env: NodeJS.ProcessEnv = process.env): AimySkillPaths {
  const override = env[AIMY_SKILL_DIR_ENV]?.trim()
  if (override !== undefined && override.length > 0) {
    const root = resolve(override)
    const beside = dirname(root)
    return { root, index: join(beside, 'aimy-skill-index.md'), triggers: join(beside, 'aimy-skill-triggers.json') }
  }
  return {
    root: fileURLToPath(new URL(`${AIMY_SKILL_DIR}/`, PACKAGE_ROOT)),
    index: fileURLToPath(new URL(AIMY_SKILL_INDEX, PACKAGE_ROOT)),
    triggers: fileURLToPath(new URL(AIMY_SKILL_TRIGGERS, PACKAGE_ROOT)),
  }
}

/**
 * Render the system block for the `aimy-skill` strategy: the strategy's own
 * text plus the bundle's absolute location, its contents, and the reading order
 * to follow. Every path is absolute so a relative path printed by the index is
 * unambiguous, and the index itself is referenced rather than inlined — it
 * covers hundreds of entries and is meant to be read on demand.
 *
 * @param strategy - the active strategy; must carry an `aimy` bundle descriptor.
 * @param paths - the resolved bundle location.
 * @returns the system-block text, or the strategy's plain system when it carries no bundle.
 */
export function renderAimySkillSystem(strategy: JailbreakStrategy, paths: AimySkillPaths): string {
  const aimy = strategy.aimy
  if (aimy === undefined) return strategy.system
  const root = withTrailingSeparator(paths.root)
  return [
    strategy.system,
    `Bundled toolkit root: ${root}`,
    `Generated index: ${paths.index}`,
    [
      'This toolkit ships inside the plugin that runs this session — it is not a checkout in the working directory, and reading it needs no network access.',
      `Contents: ${aimy.skillCount} Attack Skill prompts at "${root}ai-mian/hack-skills/skills/<name>/SKILL.md" (many with a companion document in the same directory), ${aimy.toolCount} Python modules under "${root}tools/", and ${aimy.commandCount} CLI commands run from the toolkit root.`,
      `Reading order: read the index at ${paths.index} first to pick a skill directory, then read that skill's SKILL.md at its absolute path, then any companion document it names. Read only what the current request needs.`,
      `Running the CLI: install the dependencies listed in "${root}requirements.txt", then run "python main.py <command>" with the toolkit root as the working directory. "playwright install chromium" is only needed for the SPA crawler and browser-level XSS verification.`,
      'Resolve every relative path in the index against the toolkit root above. Keep artifacts you produce in the working directory — never write into the toolkit directory.',
    ].join('\n'),
  ].join('\n\n')
}

/**
 * Append the platform separator when missing, so joining a bare filename onto
 * the result yields a usable absolute path.
 *
 * @param path - the resolved toolkit root.
 * @returns the root with exactly one trailing path separator.
 */
function withTrailingSeparator(path: string): string {
  return path.endsWith('/') || path.endsWith('\\') ? path : `${path}${path.includes('\\') ? '\\' : '/'}`
}
