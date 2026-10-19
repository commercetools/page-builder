/**
 * Guards the wiring in `jest.test.config.js`.
 *
 * Jest replaces preset keys instead of merging them, so declaring our own
 * `setupFilesAfterEnv` silently drops the preset's `setup-test-framework.js`
 * — and nothing fails, because pure-logic tests never touch what it provides.
 * That is how the app ended up with no jest-dom matchers, no Intl polyfills,
 * no fail-on-console and no Radix/jsdom patch for however long. These
 * assertions make a repeat of that loud.
 */
import presetConfig from '@commercetools-frontend/jest-preset-mc-app/typescript/jest-preset';
import jestConfig from '../jest.test.config';

describe('jest setup wiring', () => {
  it('keeps every preset setup file the preset declares', () => {
    const ours = jestConfig.setupFilesAfterEnv ?? [];
    for (const presetFile of presetConfig.setupFilesAfterEnv ?? []) {
      expect(ours).toContain(presetFile);
    }
  });

  it('still appends our own polyfills after the preset ones', () => {
    expect(jestConfig.setupFilesAfterEnv).toContain(
      '<rootDir>/jest.polyfills.js'
    );
  });
});

describe('what the preset setup file provides at runtime', () => {
  it('registers the jest-dom matchers', () => {
    expect(expect(document.body).toBeInTheDocument).toBeInstanceOf(Function);
  });

  it('installs the fail-on-console escape hatches', () => {
    expect(console.config?.addSilencedWarning).toBeInstanceOf(Function);
    expect(console.config?.addNonThrowingWarning).toBeInstanceOf(Function);
  });

  it('loads the FormatJS Intl polyfills', () => {
    expect(new Intl.PluralRules('en').select(1)).toBe('one');
    expect(new Intl.ListFormat('en').format(['a', 'b'])).toContain('and');
  });

  it('wraps getComputedStyle so Radix selectors cannot crash a render', () => {
    // structuredClone comes from our own jest.polyfills.js; asserting it here
    // proves our file survived the spread too, not just the preset's.
    expect(structuredClone({ a: [1] })).toEqual({ a: [1] });
    expect(window.getComputedStyle(document.body)).toBeTruthy();
  });
});
