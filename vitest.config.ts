import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/utils/**',
        'src/entrypoints/comfort.content/styles.ts',
        'src/entrypoints/comfort.content/editable.ts',
        'src/entrypoints/comfort.content/emoji-blocker.ts',
        'src/entrypoints/comfort.content/bg-image-detector.ts',
        'src/entrypoints/comfort.content/click-handler.ts',
        'src/entrypoints/comfort.content/dom-ready.ts',
        'src/entrypoints/popup/browser-support.ts',
      ],
      exclude: [
        'src/entrypoints/background.ts',
        'src/entrypoints/comfort.content/index.ts',
        'src/entrypoints/popup/main.ts',
      ],
      thresholds: {
        statements: 75,
        lines: 75,
        functions: 75,
        branches: 65,
      },
    },
  },
});
