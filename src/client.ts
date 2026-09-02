/**
 * Client-namespace projection of the jailbreak domain: a pure re-export of the package's
 * types outlet. Client code imports ONLY the client namespace (repo
 * discipline), so `./client` projects the same single-source content
 * `./types` serves to host consumers — zero duplication.
 *
 * @module @bainianling/dsh-jailbreak-mode/client
 */

export type * from './types.js'
