/// <reference types="vitest/globals" />

// `vitest.setup.ts` registers the jest-dom matchers; this makes them visible to
// tsc, which otherwise only sees Vitest's own Assertion interface.
import '@testing-library/jest-dom/vitest';
