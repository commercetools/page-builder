/**
 * Referential-integrity linting for a host catalog. Pure: no commercetools access.
 *
 * Structural shape is the JSON schema's job (`catalog.schema.json`); this checks what a schema
 * cannot: unique type keys, groups that exist, data-source references that resolve, nesting and
 * `localized` rules, and resolver/fill kinds the service actually implements.
 */

import Ajv2020 from 'ajv/dist/2020.js';
import {
  LOCALIZABLE_KINDS,
  type Catalog,
  type ComponentType,
  type DataSourceType,
  type FillKind,
  type PageTypeId,
  type ResolverKind,
  type SchemaField,
  type SchemaFieldKind,
} from './types.js';

const VALID_KINDS = new Set<SchemaFieldKind>([
  'text', 'richtext', 'number', 'boolean', 'select', 'image', 'video', 'link',
  'group', 'dataSource', 'product', 'productPicks', 'productPins',
  'category', 'categoryPicks', 'categoryPins',
]);
const VALID_PAGE_TYPES = new Set<PageTypeId>(['all', 'static', 'category', 'pdp', 'dynamic']);
const VALID_RESOLVERS = new Set<ResolverKind>([
  'product', 'product-list', 'products-by-category', 'product-picks', 'product-pins',
  'category', 'category-list', 'category-picks', 'category-pins', 'category-tree', 'related-products',
]);
const VALID_FILLS = new Set<FillKind>(['product-detail', 'category-listing']);
const localizable = new Set<SchemaFieldKind>(LOCALIZABLE_KINDS);

export type ValidationReport = { errors: string[]; warnings: string[] };

function validateField(
  field: SchemaField,
  where: string,
  dataSourceTypes: Set<string>,
  report: ValidationReport,
  nested: boolean
): void {
  const at = `${where} field "${field.key}"`;
  if (!field.key) report.errors.push(`${where}: a field is missing "key"`);
  if (!VALID_KINDS.has(field.kind)) report.errors.push(`${at}: invalid kind "${field.kind}"`);
  if (field.localized && !localizable.has(field.kind)) {
    report.errors.push(`${at}: "localized" is only valid on ${[...localizable].join('/')}, not "${field.kind}"`);
  }
  if (field.kind === 'dataSource' && field.dataSourceType && !dataSourceTypes.has(field.dataSourceType)) {
    report.errors.push(`${at}: dataSourceType "${field.dataSourceType}" does not match any data-source type`);
  }
  if (field.kind === 'group') {
    if (nested) report.errors.push(`${at}: group fields cannot be nested inside another group`);
    for (const child of field.children ?? []) validateField(child, at, dataSourceTypes, report, true);
  } else if (field.children?.length) {
    report.warnings.push(`${at}: "children" is ignored for kind "${field.kind}"`);
  }
}

function reportDuplicate(seen: Set<string>, id: string, label: string, report: ValidationReport): void {
  if (seen.has(id)) report.errors.push(`duplicate ${label} "${id}"`);
  seen.add(id);
}

function checkPageTypes(owner: string, pageTypes: PageTypeId[] | undefined, report: ValidationReport): void {
  for (const pt of pageTypes ?? []) {
    if (!VALID_PAGE_TYPES.has(pt)) report.errors.push(`${owner}: invalid pageType "${pt}"`);
  }
}

function validateComponent(
  c: ComponentType,
  componentGroups: Set<string>,
  dsTypes: Set<string>,
  report: ValidationReport
): void {
  const owner = `component "${c.type}"`;
  if (!componentGroups.has(c.groupKey)) {
    report.errors.push(`${owner}: groupKey "${c.groupKey}" is not a defined component group`);
  }
  checkPageTypes(owner, c.pageTypes, report);
  if (c.fill && !VALID_FILLS.has(c.fill.kind)) {
    report.errors.push(`${owner}: unknown fill kind "${c.fill.kind}"`);
  }
  for (const f of c.schema) validateField(f, owner, dsTypes, report, false);
  for (const key of c.inlineTextFields ?? []) {
    if (!c.schema.some((f) => f.key === key)) {
      report.errors.push(`${owner}: inlineTextFields entry "${key}" is not a schema field`);
    }
  }
}

function validateDataSource(
  s: DataSourceType,
  dsGroups: Set<string>,
  dsTypes: Set<string>,
  report: ValidationReport
): void {
  const owner = `data-source "${s.type}"`;
  if (!dsGroups.has(s.groupKey)) {
    report.errors.push(`${owner}: groupKey "${s.groupKey}" is not a defined data-source group`);
  }
  if (!s.resolver) {
    report.errors.push(`${owner}: missing "resolver" (the service resolves data; there is no host resolver)`);
  } else if (!VALID_RESOLVERS.has(s.resolver.kind)) {
    report.errors.push(`${owner}: unknown resolver kind "${s.resolver.kind}"`);
  }
  for (const f of s.schema) validateField(f, owner, dsTypes, report, false);
}

export function validateCatalog(catalog: Catalog): ValidationReport {
  const report: ValidationReport = { errors: [], warnings: [] };

  const dsTypes = new Set(catalog['data-sources'].sources.map((s) => s.type));
  const componentGroups = new Set(catalog.components.groups.map((g) => g.key));
  const dsGroups = new Set(catalog['data-sources'].groups.map((g) => g.key));

  const seenComponents = new Set<string>();
  for (const c of catalog.components.components) {
    reportDuplicate(seenComponents, c.type, 'component type', report);
    validateComponent(c, componentGroups, dsTypes, report);
  }

  const seenSources = new Set<string>();
  for (const s of catalog['data-sources'].sources as DataSourceType[]) {
    reportDuplicate(seenSources, s.type, 'data-source type', report);
    validateDataSource(s, dsGroups, dsTypes, report);
  }

  const seenSections = new Set<string>();
  for (const sec of catalog.sections.sections) {
    reportDuplicate(seenSections, sec.id, 'section id', report);
    checkPageTypes(`section "${sec.id}"`, sec.pageTypes, report);
  }

  return report;
}

// ── Structural validation (JSON schema) ─────────────────────────────────────────────────

// A dynamic import: the static `import … with { type: 'json' }` form is not parsed by the Sonar scanner Connect runs.
const catalogSchema = (await import('./catalog.schema.json', { with: { type: 'json' } })).default;

const ajv = new Ajv2020.default({ allErrors: true, strict: false });
const matchesSchema = ajv.compile(catalogSchema);

/**
 * Full validation of an untrusted document: structure first (so the referential checks can rely
 * on shape), then referential integrity. Every violation is reported, not just the first.
 */
export function validateCatalogDocument(input: unknown): ValidationReport {
  if (!matchesSchema(input)) {
    return {
      errors: (matchesSchema.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? 'is invalid'}`),
      warnings: [],
    };
  }
  return validateCatalog(input as unknown as Catalog);
}
