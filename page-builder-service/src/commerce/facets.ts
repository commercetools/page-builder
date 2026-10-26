/**
 * Facet definitions and attribute labels derived from the project's product types, so hosts
 * configure nothing: every searchable enum/lenum/text/boolean attribute is a facet candidate.
 *
 * `PB_FACET_ATTRIBUTES` (comma-separated names) selects and orders the facets; otherwise the
 * first `facetLimit` candidates by name are used.
 */

import type { TtlCache } from '../cache.js';
import type { ApiRoot } from '../ct/client.js';
import { loc, type AttributeLabels } from './mappers.js';
import type { CommerceContext } from './shapes.js';

type Localized = Record<string, string>;

interface CtAttributeType {
  name: string;
  values?: Array<{ key: string; label: string | Localized }>;
  elementType?: CtAttributeType;
}

interface CtAttributeDefinition {
  name: string;
  label?: Localized;
  isSearchable?: boolean;
  type: CtAttributeType;
}

interface CtProductType {
  attributes?: CtAttributeDefinition[];
}

export type FacetFieldType = 'enum' | 'lenum' | 'text' | 'boolean';

export interface FacetDefinition {
  /** Attribute name; also the facet name in requests and results. */
  name: string;
  /** Product Search field path. */
  field: string;
  fieldType: FacetFieldType;
  label?: Localized;
  /** Enum key → label, for enum/lenum attributes. */
  values: Map<string, string | Localized>;
}

export interface FacetCatalog {
  definitions: FacetDefinition[];
  labels: AttributeLabels;
}

export interface FacetOptions {
  attributes: string[];
  limit: number;
}

const PAGE_SIZE = 100;

function definitionFor(attr: CtAttributeDefinition): FacetDefinition | null {
  if (attr.isSearchable === false) return null;
  const type = attr.type.name === 'set' && attr.type.elementType ? attr.type.elementType : attr.type;
  const values = new Map((type.values ?? []).map((v) => [v.key, v.label] as const));
  const base = { name: attr.name, label: attr.label, values };
  switch (type.name) {
    case 'enum':
    case 'lenum':
      return { ...base, field: `variants.attributes.${attr.name}.key`, fieldType: type.name };
    case 'text':
      return { ...base, field: `variants.attributes.${attr.name}`, fieldType: 'text' };
    case 'boolean':
      return { ...base, field: `variants.attributes.${attr.name}`, fieldType: 'boolean' };
    default:
      return null;
  }
}

async function fetchProductTypes(client: ApiRoot): Promise<CtProductType[]> {
  const types: CtProductType[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    // Sequential by necessity: the next offset depends on the previous page's total.
    const { body: page } = await client
      .productTypes()
      .get({ queryArgs: { limit: PAGE_SIZE, offset, withTotal: true } })
      .execute();
    types.push(...page.results);
    if (types.length >= (page.total ?? 0) || page.results.length === 0) break;
  }
  return types;
}

function indexAttributes(types: CtProductType[]): {
  byName: Map<string, FacetDefinition>;
  raw: Map<string, CtAttributeDefinition>;
} {
  const byName = new Map<string, FacetDefinition>();
  const raw = new Map<string, CtAttributeDefinition>();
  for (const t of types) {
    for (const attr of t.attributes ?? []) {
      if (!raw.has(attr.name)) raw.set(attr.name, attr);
      const def = definitionFor(attr);
      if (def && !byName.has(def.name)) byName.set(def.name, def);
    }
  }
  return { byName, raw };
}

function chooseDefinitions(byName: Map<string, FacetDefinition>, options: FacetOptions): FacetDefinition[] {
  if (options.attributes.length) {
    return options.attributes.map((n) => byName.get(n)).filter((d): d is FacetDefinition => !!d);
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, options.limit);
}

function buildLabels(
  byName: Map<string, FacetDefinition>,
  raw: Map<string, CtAttributeDefinition>
): AttributeLabels {
  return {
    label: (name, locale) => loc(raw.get(name)?.label, locale),
    valueLabel: (name, key, locale) => {
      const v = byName.get(name)?.values.get(key) ?? valueFromRaw(raw.get(name), key);
      return typeof v === 'string' ? v : loc(v, locale);
    },
  };
}

export function createFacetCatalog(
  client: ApiRoot,
  cache: TtlCache,
  options: FacetOptions
): (ctx: CommerceContext) => Promise<FacetCatalog> {
  return (ctx) =>
    cache.read(
      'facets:catalog',
      async () => {
        const types = await fetchProductTypes(client);
        const { byName, raw } = indexAttributes(types);
        return { definitions: chooseDefinitions(byName, options), labels: buildLabels(byName, raw) };
      },
      { bypass: ctx.bypassCache }
    );
}

function valueFromRaw(attr: CtAttributeDefinition | undefined, key: string): string | Localized | undefined {
  if (!attr) return undefined;
  const type = attr.type.name === 'set' && attr.type.elementType ? attr.type.elementType : attr.type;
  return type.values?.find((v) => v.key === key)?.label;
}
