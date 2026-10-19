/**
 * Registry primitives — the host-side authoring surface for page-builder definitions.
 *
 * A block/data-source is defined as PURE DATA (metadata + schema). The React component and
 * the data-source resolver live in the host and are linked by `type`. Keeping definitions
 * free of React/CT imports lets the host's `buildCatalog()` step serialize them without
 * pulling the runtime.
 */

import type {
  CatalogBundle,
  ComponentGroup,
  ComponentType,
  DataSourceGroup,
  DataSourceType,
  RegistryManifestEntry,
  Section,
} from './contract.js';
import type { BaseDataSourceContext, BlockResolver, BlockResolverMap } from './types.js';

/** A component definition: the contract `ComponentType` plus host editing metadata. */
export type BlockDefinition = ComponentType & {
  /** Settings keys (schema `kind:'text'`) offered for inline editing on the render. */
  inlineTextFields?: string[];
  /**
   * Optional dynamic fill: merges extra resolved settings into the block at render time
   * (e.g. fetch products for a `count`/`source`). React-free (a closure, no JSX), so the
   * catalog build still imports definitions without a JSX runtime. For resolvers that need
   * host-specific context, prefer passing them to `buildRegistry(blocks, components, { resolvers })`.
   */
  resolve?: BlockResolver;
};

/** A data-source definition: metadata + config schema. The resolver lives in the host. */
export type DataSourceDefinition = DataSourceType;

/**
 * Identity helper — gives call-site type-checking and a grep-able marker. The `const` type
 * parameter preserves the literal `type` so a `readonly BlockDefinition[]` keeps its exact
 * key union for compile-time registry coverage (see `buildRegistry`).
 */
export function defineBlock<const T extends BlockDefinition>(def: T): T {
  return def;
}

export function defineDataSource(def: DataSourceDefinition): DataSourceDefinition {
  return def;
}

export type CatalogInput = {
  blocks: readonly BlockDefinition[];
  componentGroups: ComponentGroup[];
  dataSources: DataSourceDefinition[];
  dataSourceGroups: DataSourceGroup[];
  sections: Section[];
};

/** Drop host-only, non-serializable metadata to get a contract `ComponentType`. */
function toComponentType({
  inlineTextFields: _inline,
  resolve: _resolve,
  ...component
}: BlockDefinition): ComponentType {
  return component;
}

/** Assemble the full catalog bundle written to CT by `page-builder-sync`. */
export function buildCatalog(input: CatalogInput): CatalogBundle {
  return {
    components: {
      groups: input.componentGroups,
      components: input.blocks.map(toComponentType),
    },
    'data-sources': {
      groups: input.dataSourceGroups,
      sources: input.dataSources,
    },
    sections: { sections: input.sections },
  };
}

/** The manifest advertised to the builder in the bridge `ready` handshake. */
export function buildManifest(blocks: readonly BlockDefinition[]): RegistryManifestEntry[] {
  return blocks.map((d) => ({
    type: d.type,
    inlineTextFields: d.inlineTextFields ?? [],
  }));
}

/** All defined block type keys — used to cross-check the render registry. */
export function definedBlockTypes(blocks: readonly BlockDefinition[]): string[] {
  return blocks.map((d) => d.type);
}

/** Collect the per-block `resolve` fills into a type-keyed map. */
export function buildBlockResolvers<Ctx extends BaseDataSourceContext = BaseDataSourceContext>(
  blocks: readonly BlockDefinition[]
): BlockResolverMap<Ctx> {
  const map: BlockResolverMap<Ctx> = {};
  for (const block of blocks) {
    if (block.resolve) map[block.type] = block.resolve;
  }
  return map;
}

/**
 * The framework-agnostic half of a combined registry: the block definitions, the manifest
 * advertised to the builder, and the per-block resolvers the transform runs. The React half
 * (`componentForType`) is added by `buildRegistry` in `./react`.
 */
export interface RenderableRegistry<Ctx extends BaseDataSourceContext = BaseDataSourceContext> {
  blocks: readonly BlockDefinition[];
  manifest: RegistryManifestEntry[];
  resolversByType: BlockResolverMap<Ctx>;
}
