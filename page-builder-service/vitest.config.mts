import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcov'],
      include: ['src/**/*.ts'],
      // Generated from openapi.yaml; the drift spec guards it.
      exclude: ['src/**/*.spec.ts', 'src/index.ts', 'src/generated/**', 'src/testing/**'],
      // A ratchet, not a target: raise as tests land; never lower to make a change pass.
      thresholds: { statements: 95, lines: 95, branches: 90, functions: 95 },
    },
  },
});
