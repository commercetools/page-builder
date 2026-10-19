import { defineConfig } from 'vitest/config';

// This package ships ESM under NodeNext and includes .tsx (the React runtime and
// the visual-editing bridge), so the app's Babel-CJS Jest preset cannot run it.
// Vitest handles both without a bespoke transform layer.
export default defineConfig({
  test: {
    // Node by default; the React entry points opt into jsdom per-file with
    // `// @vitest-environment jsdom`.
    environment: 'node',
    include: ['src/**/*.spec.{ts,tsx}'],
    // jest-dom matchers, for the specs that opt into jsdom.
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.spec.{ts,tsx}',
        // Type-only module: interfaces and unions, no runtime statements.
        'src/types.ts',
        // Re-export barrels.
        'src/index.ts',
        'src/core/index.ts',
        'src/test-utils/**',
      ],
      // A ratchet, not a target. Raise as tests land; never lower to make a change
      // pass. Target is 85% statements and lines — see design.md for why branches
      // and functions carry lower floors.
      // Statements and lines are at the 85% target. Branches and functions
      // carry lower floors on purpose (see design.md) and still ratchet.
      thresholds: {
        statements: 86,
        lines: 88,
        branches: 82,
        functions: 95,
      },
    },
  },
});
