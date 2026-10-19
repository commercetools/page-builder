/**
 * Referential-integrity linting for a CatalogBundle (docs/sdd/definitions-contract.md §5).
 * Pure — no CT access. Used by the `validate` command and as a guard inside `sync`.
 */

import {
  LOCALIZABLE_KINDS,
  type CatalogBundle,
  type DataSourceType,
  type PageTypeId,
  type SchemaField,
  type SchemaFieldKind,
} from '../contract.js';

const VALID_KINDS = new Set<SchemaFieldKind>([
  'text',
  'richtext',
  'number',
  'boolean',
  'select',
  'image',
  'video',
  'link',
  'group',
  'dataSource',
  'product',
  'productPicks',
  'productPins',
  'category',
  'categoryPicks',
  'categoryPins',
]);

const VALID_PAGE_TYPES = new Set<PageTypeId>([
  'all',
  'static',
  'category',
  'pdp',
  'dynamic',
]);

const localizableKinds = new Set<SchemaFieldKind>(LOCALIZABLE_KINDS);

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
  if (!VALID_KINDS.has(field.kind)) {
    report.errors.push(`${at}: invalid kind "${field.kind}"`);
  }
  if (field.localized && !localizableKinds.has(field.kind)) {
    report.errors.push(
      `${at}: "localized" is only valid on ${[...localizableKinds].join('/')}, not "${field.kind}"`
    );
  }
  if (field.kind === 'dataSource') {
    const t = field.dataSourceType;
    if (t && t !== '' && !dataSourceTypes.has(t)) {
      report.errors.push(
        `${at}: dataSourceType "${t}" does not match any data-source type`
      );
    }
  }
  if (field.kind === 'group') {
    if (nested) {
      report.errors.push(`${at}: group fields cannot be nested inside another group`);
    }
    for (const child of field.children ?? []) {
      validateField(child, at, dataSourceTypes, report, true);
    }
  } else if (field.children?.length) {
    report.warnings.push(`${at}: "children" is ignored for kind "${field.kind}"`);
  }
}

export function validateBundle(bundle: CatalogBundle): ValidationReport {
  const report: ValidationReport = { errors: [], warnings: [] };

  const dsTypes = new Set(bundle['data-sources'].sources.map((s) => s.type));
  const componentGroups = new Set(bundle.components.groups.map((g) => g.key));
  const dsGroups = new Set(bundle['data-sources'].groups.map((g) => g.key));

  // Unique type keys.
  const seenComp = new Set<string>();
  for (const c of bundle.components.components) {
    if (seenComp.has(c.type)) report.errors.push(`duplicate component type "${c.type}"`);
    seenComp.add(c.type);
    if (!componentGroups.has(c.groupKey)) {
      report.errors.push(
        `component "${c.type}": groupKey "${c.groupKey}" is not a defined component group`
      );
    }
    for (const pt of c.pageTypes ?? []) {
      if (!VALID_PAGE_TYPES.has(pt)) {
        report.errors.push(`component "${c.type}": invalid pageType "${pt}"`);
      }
    }
    for (const f of c.schema) {
      validateField(f, `component "${c.type}"`, dsTypes, report, false);
    }
  }

  const seenDs = new Set<string>();
  for (const s of bundle['data-sources'].sources as DataSourceType[]) {
    if (seenDs.has(s.type)) report.errors.push(`duplicate data-source type "${s.type}"`);
    seenDs.add(s.type);
    if (!dsGroups.has(s.groupKey)) {
      report.errors.push(
        `data-source "${s.type}": groupKey "${s.groupKey}" is not a defined data-source group`
      );
    }
    for (const f of s.schema) {
      validateField(f, `data-source "${s.type}"`, dsTypes, report, false);
    }
  }

  const seenSection = new Set<string>();
  for (const sec of bundle.sections.sections) {
    if (seenSection.has(sec.id)) report.errors.push(`duplicate section id "${sec.id}"`);
    seenSection.add(sec.id);
    for (const pt of sec.pageTypes) {
      if (!VALID_PAGE_TYPES.has(pt)) {
        report.errors.push(`section "${sec.id}": invalid pageType "${pt}"`);
      }
    }
  }

  return report;
}
