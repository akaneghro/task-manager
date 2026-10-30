import { fileURLToPath } from 'node:url'
import AutoImport from 'unplugin-auto-import/vite'
import { defineConfig } from 'vitest/config'

const r = (path: string) => fileURLToPath(new URL(path, import.meta.url))

const alias = {
  '~': r('./app'),
  '#shared': r('./shared'),
}

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: ['shared/**/*.ts', 'server/services/**/*.ts', 'server/utils/**/*.ts', 'server/mcp/**/*.ts', 'scripts/lib/**/*.ts', 'app/utils/**/*.ts', 'app/composables/**/*.ts'],
      exclude: ['**/__tests__/**', '**/*.d.ts'],
    },
    projects: [
      {
        // Server, shared and script logic: plain Node, explicit imports.
        resolve: { alias },
        test: {
          name: 'server',
          environment: 'node',
          include: ['server/**/__tests__/**/*.test.ts', 'shared/**/__tests__/**/*.test.ts', 'scripts/**/__tests__/**/*.test.ts'],
        },
      },
      {
        // Client composables/utils: happy-dom + the auto-imports Nuxt would provide.
        plugins: [
          AutoImport({
            imports: ['vue'],
            dirs: ['./app/composables', './app/utils', './shared/utils'],
            dts: false,
          }),
          {
            name: 'nuxt-import-meta',
            enforce: 'pre',
            transform(code: string, id: string) {
              if (id.includes('node_modules')) return null
              const transformed = code
                .replaceAll('import.meta.client', '(true)')
                .replaceAll('import.meta.server', '(false)')
              return transformed !== code ? transformed : null
            },
          },
        ],
        resolve: { alias },
        test: {
          name: 'app',
          environment: 'happy-dom',
          globals: true,
          include: ['app/**/__tests__/**/*.test.ts'],
        },
      },
    ],
  },
})
