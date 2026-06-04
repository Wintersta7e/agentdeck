import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  test: {
    globals: true,
    projects: [
      {
        test: {
          name: 'main',
          environment: 'node',
          include: ['src/main/**/*.test.ts', 'src/shared/**/*.test.ts'],
          setupFiles: ['src/__test__/setup.main.ts'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/renderer/**/*.test.ts', 'src/renderer/**/*.test.tsx'],
          setupFiles: ['src/__test__/setup.renderer.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/__test__/**',
        'src/preload/**',
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/*.d.ts',
        // React render layer — rendering isn't unit-tested; the testable logic
        // lives in .ts hooks/utils/store (which stay in scope below).
        'src/**/*.tsx',
        // Electron bootstrap / window / IPC-wiring glue — not unit-testable.
        'src/main/index.ts',
        'src/main/app-window.ts',
        'src/main/app-ipc.ts',
        'src/main/template-runtime.ts',
        'src/main/worktree-runtime.ts',
        'src/main/wsl-runtime.ts',
        'src/main/ipc/index.ts',
      ],
      // Scoped to testable logic (React render + Electron bootstrap excluded
      // above). Floors sit ~10pts below current actuals (stmts 69 / br 65 /
      // fn 62 / lines 71) to catch regressions without being brittle.
      thresholds: {
        statements: 60,
        branches: 55,
        functions: 55,
        lines: 60,
      },
    },
  },
})
