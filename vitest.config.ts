import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/** Self-reference the package entrypoints to src so tests run without a build. */
export default defineConfig({
  resolve: {
    alias: {
      '@deepseek-ai/dsh-jailbreak-mode': fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      '@deepseek-ai/dsh-jailbreak-mode/invariant': fileURLToPath(new URL('./src/invariant.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
  },
})
