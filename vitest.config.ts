import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        'examples/',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/*.config.*',
        '**/index.ts', // Re-export files
        '.eslintrc.cjs',
      ],
      include: [
        'src/**/*.ts'
      ],
      thresholds: {
        global: {
          branches: 85,
          functions: 85,
          lines: 85,
          statements: 85,
        },
      },
    },
    testTimeout: 10000,
  },
});