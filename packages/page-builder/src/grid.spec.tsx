import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PBText } from './edit-context.js';
import { hiddenOn, Sections, type ComponentMap } from './grid.js';
import type { LayoutSection } from './wire.js';

const hero: ComponentMap[string] = ({ data }) => <h1 data-testid="hero">{(data as { title: string }).title}</h1>;
const editable: ComponentMap[string] = ({ data }) => <PBText field="title" value={(data as { title: string }).title} as="h2" />;
const components: ComponentMap = { 'content/hero': hero, 'content/editable': editable };

const item = (id: string, type: string, configuration: Record<string, unknown> = {}) => ({
  layoutItemId: id,
  layoutItemType: type,
  configuration: { mobile: true, tablet: true, desktop: true, ...configuration },
});
const element = (id: string, size: unknown, items: unknown[], visibility: Record<string, boolean> = {}) =>
  ({ layoutElementId: id, configuration: { mobile: true, tablet: true, desktop: true, size, ...visibility }, items }) as never;
const section = (id: string, elements: unknown[], background?: string): LayoutSection =>
  ({ sectionId: id, ...(background ? { configuration: { background } } : {}), layoutElements: elements }) as never;

const html = (sections: LayoutSection[], extra: Partial<Parameters<typeof Sections>[0]> = {}) =>
  renderToStaticMarkup(<Sections sections={sections} components={components} {...extra} />);

describe('hiddenOn', () => {
  it.each([
    [{ mobile: true, tablet: true, desktop: true }, undefined],
    [undefined, undefined],
    [{}, undefined],
    [{ mobile: false }, 'm'],
    [{ mobile: false, desktop: false }, 'm d'],
    [{ mobile: false, tablet: false, desktop: false }, 'm t d'],
  ])('hiddenOn(%j) = %s', (v, expected) => {
    expect(hiddenOn(v)).toBe(expected);
  });
});

describe('Sections', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('renders the grid with column spans and the host component', () => {
    const out = html([
      section('s1', [
        element('e1', { mobile: 12, tablet: 6, desktop: 6 }, [item('i1', 'content/hero', { title: 'Hello' })]),
        element('e2', 12, [item('i2', 'content/hero', { title: 'World' })]),
      ]),
    ]);
    expect(out).toContain('class="pb-sections"');
    expect(out).toContain('class="pb-section"');
    expect(out).toContain('class="pb-container"');
    expect(out).toContain('class="pb-grid"');
    expect(out).toContain('--pb-cols-m:12;--pb-cols-t:6;--pb-cols-d:6');
    expect(out).toContain('--pb-cols-m:12"');
    expect(out).toContain('<h1 data-testid="hero">Hello</h1>');
    expect(out).toContain('<h1 data-testid="hero">World</h1>');
  });

  it('defaults a missing size to full width and a partial responsive size sensibly', () => {
    const out = html([
      section('s', [element('a', undefined, [item('i', 'content/hero', { title: 'x' })]), element('b', { tablet: 4 }, [item('j', 'content/hero', { title: 'y' })])]),
    ]);
    expect(out).toContain('style="--pb-cols-m:12"');
    expect(out).toContain('--pb-cols-m:12;--pb-cols-t:4');
    expect(out).not.toContain('--pb-cols-d');
  });

  it('marks per-device visibility on items, cells and sections', () => {
    const out = html([
      section('s', [
        element('a', 12, [item('i', 'content/hero', { title: 'x', mobile: false })], { tablet: false }),
        element('b', 12, [item('j', 'content/hero', { title: 'y' })], { mobile: false, tablet: false, desktop: false }),
      ]),
    ]);
    expect(out).toContain('data-pb-hide="m"'); // item hidden on mobile
    expect(out).toContain('data-pb-hide="t"'); // cell a hidden on tablet
    expect(out).toContain('data-pb-hide="m t d"'); // cell b hidden everywhere
  });

  it('hides a section only on devices where every element is hidden', () => {
    const out = html([
      section('s', [
        element('a', 6, [item('i', 'content/hero', { title: 'x' })], { mobile: false }),
        element('b', 6, [item('j', 'content/hero', { title: 'y' })], { mobile: false, desktop: false }),
      ]),
    ]);
    expect(out).toContain('class="pb-section" data-pb-hide="m"');
  });

  it('applies the theme background class to a section, case-insensitively', () => {
    const theme = { sectionBackgrounds: { Dark: { background: '#111' } } };
    const out = html([section('s', [element('a', 12, [item('i', 'content/hero', { title: 'x' })])], 'dark')], { theme });
    expect(out).toContain('class="pb-section pb-bg-dark"');
    const none = html([section('s', [element('a', 12, [item('i', 'content/hero', { title: 'x' })])], 'unknown')], { theme });
    expect(none).toContain('class="pb-section"');
  });

  it('skips sections and cells with nothing in them', () => {
    const out = html([
      section('empty-1', []),
      section('empty-2', [element('a', 12, [])]),
      section('s', [element('b', 12, []), element('c', 12, [item('i', 'content/hero', { title: 'only' })])]),
    ]);
    expect(out.match(/class="pb-section( |")/g)).toHaveLength(1);
    expect(out.match(/class="pb-cell"/g)).toHaveLength(1);
  });

  it('emits the data-pb-* markers only in edit mode', () => {
    const sections = [section('s', [element('layout-1', 12, [item('item-1', 'content/hero', { title: 'x' })])])];
    const published = html(sections);
    expect(published).not.toContain('data-pb-id');
    expect(published).not.toContain('data-pb-type');
    expect(published).not.toContain('data-pb-kind');
    expect(published).not.toContain('data-pb-dropzone');
    expect(published).not.toContain('data-pb-section');

    const edit = html(sections, { editMode: true });
    expect(edit).toContain('data-pb-section="MAIN"');
    expect(edit).toContain('data-pb-kind="section"');
    expect(edit).toContain('data-pb-id="layout-1"');
    expect(edit).toContain('data-pb-kind="layout"');
    expect(edit).toContain('data-pb-id="item-1"');
    expect(edit).toContain('data-pb-type="content/hero"');
    expect(edit).toContain('data-pb-kind="component"');
    expect(edit).toContain('&quot;layoutId&quot;:&quot;layout-1&quot;');
    expect(edit).toContain('&quot;layoutId&quot;:null');
  });

  it('gives edit-mode components the edit flag, so PBText marks its field', () => {
    const sections = [section('s', [element('a', 12, [item('i', 'content/editable', { title: 'Editable' })])])];
    expect(html(sections)).not.toContain('data-pb-field');
    expect(html(sections, { editMode: true })).toContain('<h2 data-pb-field="title">Editable</h2>');
  });

  it('renders a visible placeholder for an unknown type in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const out = html([section('s', [element('a', 12, [item('i', 'brand/missing')])])]);
    expect(out).toContain('Unknown block type');
    expect(out).toContain('brand/missing');
  });

  it('renders nothing for an unknown type in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const out = html([section('s', [element('a', 12, [item('i', 'brand/missing')])])]);
    expect(out).not.toContain('Unknown block type');
    expect(out).not.toContain('brand/missing');
  });

  it('names an empty type in the placeholder', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(html([section('s', [element('a', 12, [item('i', '')])])])).toContain('(empty)');
  });

  it('falls back to indexes for keys when ids are absent', () => {
    const out = html([
      { sectionId: 's', layoutElements: [{ configuration: {}, items: [{ layoutItemType: 'content/hero', configuration: { title: 'x' } }] }] } as never,
    ]);
    expect(out).toContain('<h1 data-testid="hero">x</h1>');
  });
});
