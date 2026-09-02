import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/** Self-reference package entrypoints to source while testing. */
export default defineConfig({
  resolve: {
    alias: {
      '@bainianling/dsh-jailbreak-mode': fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      '@bainianling/dsh-jailbreak-mode/invariant': fileURLToPath(new URL('./src/invariant.ts', import.meta.url)),
    },
  },
  test: { environment: 'node', include: ['tests/**/*.spec.ts'] },
})
