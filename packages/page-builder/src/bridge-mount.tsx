'use client';

import { VisualEditingBridge } from './bridge.js';
import type { RegistryManifestEntry } from './contract.js';

/**
 * Mounts the bridge with the allowed origins and manifest the service returned for an edit-mode
 * render. A server component cannot hand the bridge a function, so a refresh request simply
 * reloads the page, which re-renders the draft on the server.
 */
export function BridgeMount({
  allowedOrigins,
  manifest,
}: {
  allowedOrigins: string[];
  manifest: RegistryManifestEntry[];
}) {
  return (
    <VisualEditingBridge
      allowedOrigins={allowedOrigins.join(',')}
      components={manifest}
      onRefresh={() => window.location.reload()}
    />
  );
}
