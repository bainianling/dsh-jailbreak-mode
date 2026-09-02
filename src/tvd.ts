/**
 * TVD self-loop harness helpers: workspace path derivation, scaffolding, and
 * system-block rendering. A TVD strategy runs the model inside a small coding
 * project: the harness writes Task/Validator/Data skeleton files into the
 * session workspace, the model completes the data so the validator passes, and
 * each failed run returns as a programming error instead of a refusal.
 *
 * The workspace path is derived from the session header's persisted `cwd` plus
 * the strategy id from the logged `jailbreak/mode`, so it is reconstructable
 * from the session log alone (model-visible ⟺ logged). No extra session event
 * is needed.
 *
 * @module @bainianling/dsh-jailbreak-mode/tvd
 */

import { join } from 'node:path'
import type { FileSystem } from '@deepseek-ai/dsh-fs'
import type { JailbreakStrategy, TvdWorkspaceFile } from './strategies.js'

/** Default workspace subdirectory under the session cwd. */
export const DEFAULT_TVD_SUBDIR = 'tvd'

/** Template variables substituted into scaffolded file content. */
export interface TvdTemplateVars {
  /** Classifier model name substituted for `{{validatorModel}}`. */
  readonly validatorModel: string
}

/**
 * Derive the TVD workspace root for a session: `<cwd>/<subdir>/<strategyId>`.
 * Pure and deterministic so resume/fork reconstruct it from the log without a
 * live mirror.
 *
 * @param cwd - the session header's persisted working directory.
 * @param subdir - the configured workspace subdirectory (defaults to `tvd`).
 * @param strategyId - the logged strategy id.
 * @returns the absolute workspace root.
 */
export function workspaceRoot(cwd: string, subdir: string, strategyId: string): string {
  return join(cwd, subdir, strategyId)
}

/**
 * Scaffold a TVD strategy's skeleton files into the workspace. Uses the `fs`
 * service so writes honor the backend's atomic-write and containment rules;
 * missing parent directories are created by the backend. Files are overwritten
 * unconditionally so re-activating the same strategy resets the harness.
 *
 * @param fileSystem - the `ctx.fs` service; must be present or the strategy
 *   degrades to the prompt-only variant.
 * @param root - the workspace root to scaffold into.
 * @param files - the skeleton files to write.
 * @param vars - template variables substituted into file content.
 * @param signal - optional abort signal forwarded to the fs calls.
 */
export async function scaffoldTvdWorkspace(
  fileSystem: FileSystem,
  root: string,
  files: readonly TvdWorkspaceFile[],
  vars: TvdTemplateVars,
  signal?: AbortSignal,
): Promise<void> {
  for (const file of files) {
    const target = await fileSystem.resolve(file.path, signal === undefined ? { cwd: root } : { cwd: root, signal })
    const content = file.content.replaceAll('{{validatorModel}}', vars.validatorModel)
    await fileSystem.writeText(target, content, undefined, signal)
  }
}

/**
 * Render the system block for a TVD strategy: the base strategy text plus the
 * harness task, the workspace path, and the entrypoint command. The path and
 * command make the harness's location and failure mode explicit so the model
 * runs the validator itself and sees the programming error.
 *
 * @param strategy - the active strategy; must carry a `tvd` harness.
 * @param root - the scaffolded workspace root.
 * @returns the system-block text, or the strategy's plain system when it has no TVD harness.
 */
export function renderTvdSystem(strategy: JailbreakStrategy, root: string): string {
  const tvd = strategy.tvd
  if (tvd === undefined) return strategy.system
  return [
    strategy.system,
    `Workspace: ${root}`,
    tvd.task,
    `Run \`${tvd.entrypoint}\` inside the workspace to see the failure, then fix the data until it passes.`,
  ].join('\n\n')
}
