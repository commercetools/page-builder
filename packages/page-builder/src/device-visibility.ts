import type { Configuration } from './types.js';

/**
 * Tailwind responsive-visibility classes for a per-device `Configuration`.
 * Returns `undefined` when visible on all breakpoints (no class needed). The
 * `block`/`hidden` × breakpoint variants must be in the host's Tailwind safelist.
 */
export function deviceVisibility(configuration?: Configuration): string | undefined {
  const mobile = configuration?.mobile ?? true;
  const tablet = configuration?.tablet ?? true;
  const desktop = configuration?.desktop ?? true;
  if (mobile && tablet && desktop) {
    return undefined;
  }
  return `${mobile ? 'block' : 'hidden'} ${tablet ? 'md:block' : 'md:hidden'} ${desktop ? 'lg:block' : 'lg:hidden'}`;
}
