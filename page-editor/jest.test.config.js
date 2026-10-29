process.env.ENABLE_NEW_JSX_TRANSFORM = 'true';

// Jest replaces preset keys rather than merging them, so anything the preset puts
// in `setupFilesAfterEnv` is lost the moment we declare our own. Pull the preset in
// and spread it, or we silently drop `setup-test-framework.js` — jest-dom matchers,
// the FormatJS Intl polyfills, fail-on-console, the RTL config, and the
// `getComputedStyle` patch that keeps Radix (and therefore Nimbus) from throwing
// on its own selectors under jsdom. `src/jest-setup.spec.ts` guards this.
const preset = require('@commercetools-frontend/jest-preset-mc-app/typescript/jest-preset');

/**
 * @type {import('@jest/types').Config.ProjectConfig}
 */
module.exports = {
  preset: '@commercetools-frontend/jest-preset-mc-app/typescript',
  setupFilesAfterEnv: [
    ...preset.setupFilesAfterEnv,
    // Nimbus ships its own jsdom shims (ResizeObserver, matchMedia, pointer
    // capture and friends) that its Radix-based primitives need to mount.
    '@commercetools/nimbus/setup-jsdom-polyfills',
    '<rootDir>/jest.polyfills.js',
  ],

  moduleNameMapper: {
    // Same spread rule as above — the preset's mappings (asset stubs, the
    // @react-hook CJS redirects) vanish if we assign over this key.
    ...preset.moduleNameMapper,
    // Nimbus's CJS chunks require each other as `./x.cjs.js`, but the files on
    // disk are `./x.cjs` — 151 of its 181 chunks, and no `.cjs.js` file exists
    // in the package at all. Browser builds resolve the ESM entry so they never
    // hit it; Jest resolves `main` and dies on the first Nimbus import. Strip
    // the spurious suffix.
    '^(\\.{1,2}/.*)\\.cjs\\.js$': '$1.cjs',
  },

  // Without this, Istanbul only instruments files a test already imports, and an
  // untested file is invisible rather than counted as zero. That is what let the
  // suite report 66% over a 278-statement denominator while the real tree is ~3,700.
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    // Tests and the harness they share are not the subject of measurement.
    '!src/**/*.spec.{ts,tsx}',
    '!src/test-utils/**',
    // Generated from the CT schema; regenerating it is not our behaviour to test.
    '!src/types/generated/**',
    // Extracted translation payloads and `defineMessages` catalogues — data, not logic.
    '!src/i18n/data/**',
    '!src/**/messages.ts',
    // Ambient declarations and re-export barrels emit no statements worth covering.
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
  coverageReporters: ['text-summary', 'json-summary', 'lcov'],

  // Statements and lines are at the 85% target. Branches and functions carry
  // lower floors on purpose (see design.md) and still ratchet upward. Raise
  // these as coverage improves; never lower one to make a change pass.
  coverageThreshold: {
    global: {
      statements: 91.4,
      lines: 92.3,
      branches: 81.6,
      functions: 85.3,
    },
  },
};
