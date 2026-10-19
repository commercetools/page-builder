'use client';
/**
 * Mounts the page-builder visual-editing bridge. INERT for normal shoppers — it only
 * activates when the Merchant Center opens this storefront with `?pb_edit=1` from an
 * allowed origin. Mount it ONCE, high in the tree (e.g. in `app/layout.tsx` inside
 * `<body>`), since it must sit at a persistent client boundary.
 *
 * `allowedOrigins` and `components` (the registry manifest) are passed in as props from a
 * SERVER parent — read them there via `getPageBuilderConfig()` + `registry.manifest`, so the
 * allowlist stays server-side (no `NEXT_PUBLIC_` client leak) and the client bundle doesn't
 * pull the whole registry.
 *
 * Scaffolded by `@commercetools-labs/page-builder init`.
 */
import { VisualEditingBridge } from '@commercetools-labs/page-builder/bridge';
import type { RegistryManifestEntry } from '@commercetools-labs/page-builder';
import { useRouter } from 'next/navigation';

export function BridgeMount({
  allowedOrigins,
  components,
}: {
  allowedOrigins: string;
  components: RegistryManifestEntry[];
}) {
  const router = useRouter();
  return (
    <VisualEditingBridge
      allowedOrigins={allowedOrigins}
      components={components}
      onRefresh={() => router.refresh()}
    />
  );
}
