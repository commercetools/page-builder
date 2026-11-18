/**
 * Setup for the jsdom-environment specs (the React entry points).
 *
 * Testing Library only registers its own `afterEach(cleanup)` when a global
 * `afterEach` exists, and this project runs Vitest without globals — so without
 * the explicit hook below every render accumulates in the same document and
 * queries start finding matches from earlier tests.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

// jsdom ships no ResizeObserver, and the visual-editing bridge observes the
// document to keep the builder's overlay geometry in step with reflows.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
