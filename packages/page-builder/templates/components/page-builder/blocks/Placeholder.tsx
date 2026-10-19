/**
 * Placeholder block — every scaffolded block renders this visible stub until you connect a
 * real component. Replace the entries in `lib/page-builder/registry.tsx` with your own
 * Home / PLP / PDP components, then delete this file.
 *
 * Uses inline styles on purpose so it renders regardless of the host's CSS setup.
 *
 * Scaffolded by `@commercetools-labs/page-builder init`.
 */
import type { ItemProps } from '@commercetools-labs/page-builder';

export function Placeholder(_props: ItemProps) {
  return (
    <div
      style={{
        border: '1px dashed #f59e0b',
        background: '#fffbeb',
        color: '#b45309',
        padding: '1rem',
        borderRadius: '0.375rem',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '0.875rem',
      }}
    >
      Page-builder placeholder — connect a real component for this block in{' '}
      <b>lib/page-builder/registry.tsx</b>.
    </div>
  );
}
