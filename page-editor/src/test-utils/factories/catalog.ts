/**
 * Builders for the component / data-source / section catalogs and the page tree.
 */
import type {
  ComponentGroup,
  ComponentType,
  DataSourceGroup,
  DataSourceType,
  PageNode,
  SavedDataSource,
  SchemaField,
  Section,
  SelectOption,
} from '../../components/page-builder/types';
import { localized, nextId } from './page';

export const buildSchemaField = (
  over: Partial<SchemaField> = {}
): SchemaField => ({
  key: 'title',
  label: 'Title',
  kind: 'text',
  ...over,
});

export const buildSelectOption = (
  over: Partial<SelectOption> = {}
): SelectOption => ({ key: 'a', label: 'Option A', ...over });

export const buildComponentType = (
  over: Partial<ComponentType> = {}
): ComponentType => ({
  type: 'content/hero',
  name: localized('Hero'),
  icon: 'Image',
  groupKey: 'content',
  schema: [buildSchemaField()],
  ...over,
});

export const buildComponentGroup = (
  over: Partial<ComponentGroup> = {}
): ComponentGroup => ({ key: 'content', name: 'Content', ...over });

export const buildDataSourceType = (
  over: Partial<DataSourceType> = {}
): DataSourceType => ({
  type: 'commerce/product-list',
  name: localized('Product list'),
  icon: 'ShoppingBag',
  groupKey: 'commerce',
  schema: [buildSchemaField({ key: 'limit', label: 'Limit', kind: 'number' })],
  ...over,
});

export const buildDataSourceGroup = (
  over: Partial<DataSourceGroup> = {}
): DataSourceGroup => ({ key: 'commerce', name: 'Commerce', ...over });

export const buildSavedDataSource = (
  over: Partial<SavedDataSource> = {}
): SavedDataSource => ({
  id: nextId('ds'),
  type: 'commerce/product-list',
  name: localized('Featured products'),
  config: {},
  savedForReuse: true,
  ...over,
});

export const buildSection = (over: Partial<Section> = {}): Section => ({
  id: 'MAIN',
  name: localized('Main'),
  description: localized('Primary content'),
  icon: 'ViewAgenda',
  pageTypes: ['all'],
  ...over,
});

export const buildPageNode = (over: Partial<PageNode> = {}): PageNode => ({
  id: nextId('page'),
  title: 'A page',
  type: 'template',
  ...over,
});
