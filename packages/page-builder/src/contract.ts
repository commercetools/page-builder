/**
 * The visual-editing bridge protocol shared with the Merchant Center page builder
 * (docs/sdd/preview-contract.md §6–9). Wire types for the render tree come from the service's
 * OpenAPI document (see `wire.ts`).
 */

export const BRIDGE_CHANNEL = 'pb-visual-editing' as const;
export const BRIDGE_VERSION = 1 as const;

/** One advertised component: the block type and its inline-editable text fields. */
export type RegistryManifestEntry = {
  type: string;
  inlineTextFields: string[];
};

export type BridgeCapabilities = {
  select?: boolean;
  refresh?: boolean;
  dnd?: boolean;
  dropzones?: boolean;
  inlineText?: boolean;
};

export type BridgeMessage = {
  channel: typeof BRIDGE_CHANNEL;
  v: typeof BRIDGE_VERSION;
  type: string;
  payload?: unknown;
};
