import { describe, expect, it } from 'vitest';
import { deviceVisibility } from './device-visibility.js';

describe('deviceVisibility', () => {
  it('emits no class when visible on every breakpoint', () => {
    expect(deviceVisibility(undefined)).toBeUndefined();
    expect(deviceVisibility({})).toBeUndefined();
    expect(
      deviceVisibility({ mobile: true, tablet: true, desktop: true })
    ).toBeUndefined();
  });

  it('defaults an unset breakpoint to visible', () => {
    // Only desktop is stated, so mobile and tablet stay visible.
    expect(deviceVisibility({ desktop: false })).toBe(
      'block md:block lg:hidden'
    );
  });

  it('emits a hidden variant per hidden breakpoint', () => {
    expect(
      deviceVisibility({ mobile: false, tablet: true, desktop: true })
    ).toBe('hidden md:block lg:block');
    expect(
      deviceVisibility({ mobile: false, tablet: false, desktop: false })
    ).toBe('hidden md:hidden lg:hidden');
  });
});
