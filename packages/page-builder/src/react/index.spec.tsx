// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  DEFAULT_CONTAINER_CLASSNAME,
  DEFAULT_SECTIONS_CLASSNAME,
  buildRegistry,
  createSections,
} from './index.js';
import { PBText } from './edit-context.js';
import type { LayoutSection } from '../types.js';
import { buildComponentType, localized } from '../test-utils/factories.js';

const Hero = ({ data }: { data: Record<string, unknown> }) => (
  <div data-testid="hero">{String(data.title ?? '')}</div>
);

const blocks = [
  { ...buildComponentType({ type: 'content/hero', name: localized('Hero') }) },
] as const;

const registry = (over: Parameters<typeof buildRegistry>[2] = {}) =>
  buildRegistry(blocks, { 'content/hero': Hero } as never, over);

const section = (over: Partial<LayoutSection> = {}): LayoutSection =>
  ({
    sectionId: 's1',
    layoutElements: [
      {
        layoutElementId: 'l1',
        configuration: {
          mobile: true,
          tablet: true,
          desktop: true,
          size: 12,
        },
        items: [
          {
            layoutItemId: 'c1',
            layoutItemType: 'content/hero',
            configuration: {
              mobile: true,
              tablet: true,
              desktop: true,
              title: 'Welcome',
            },
          },
        ],
      },
    ],
    ...over,
  }) as LayoutSection;

describe('buildRegistry', () => {
  it('exposes the block definitions and their manifest', () => {
    const r = registry();
    expect(r.blocks).toBe(blocks);
    expect(r.manifest.map((m) => m.type)).toEqual(['content/hero']);
  });

  it('resolves a component by type', () => {
    expect(registry().componentForType('content/hero')).toBe(Hero);
  });

  it('resolves nothing for an unregistered type', () => {
    expect(registry().componentForType('nope')).toBeUndefined();
  });

  it('falls back to a system component', () => {
    const System = () => null;
    const r = registry({ systemComponents: { 'system/spacer': System } });
    expect(r.componentForType('system/spacer')).toBe(System);
  });

  it('prefers a palette component over a system one of the same type', () => {
    const System = () => null;
    const r = registry({ systemComponents: { 'content/hero': System } });
    expect(r.componentForType('content/hero')).toBe(Hero);
  });

  it('collects per-block resolvers', () => {
    const resolve = vi.fn(async () => ({}));
    const r = buildRegistry(
      [{ ...buildComponentType({ type: 'content/hero' }), resolve }] as never,
      { 'content/hero': Hero } as never
    );
    expect(r.resolversByType['content/hero']).toBeDefined();
  });

  it('lets an explicit resolver override the block-declared one', () => {
    const declared = vi.fn(async () => ({ from: 'block' }));
    const override = vi.fn(async () => ({ from: 'opts' }));
    const r = buildRegistry(
      [{ ...buildComponentType({ type: 'content/hero' }), resolve: declared }] as never,
      { 'content/hero': Hero } as never,
      { resolvers: { 'content/hero': override } as never }
    );
    expect(r.resolversByType['content/hero']).toBe(override);
  });

  it('ignores an undefined entry in the resolver overrides', () => {
    const r = buildRegistry(blocks, { 'content/hero': Hero } as never, {
      resolvers: { 'content/hero': undefined } as never,
    });
    expect(r.resolversByType['content/hero']).toBeUndefined();
  });
});

describe('createSections rendering', () => {
  it('renders each item through its registered component', () => {
    const Sections = createSections(registry());
    render(<Sections sections={[section()]} />);
    expect(screen.getByTestId('hero')).toHaveTextContent('Welcome');
  });

  it('renders nothing for an item with no registered component', () => {
    const Sections = createSections(registry());
    render(
      <Sections
        sections={[
          section({
            layoutElements: [
              {
                layoutElementId: 'l1',
                configuration: { mobile: true, tablet: true, desktop: true, size: 12 },
                items: [
                  {
                    layoutItemId: 'c1',
                    layoutItemType: 'unknown/thing',
                    configuration: {},
                  },
                ],
              },
            ],
          } as never),
        ]}
      />
    );
    expect(screen.queryByTestId('hero')).not.toBeInTheDocument();
  });

  it('uses the default wrapper class names', () => {
    const Sections = createSections(registry());
    const { container } = render(<Sections sections={[section()]} />);
    expect(container.querySelector(`.${DEFAULT_SECTIONS_CLASSNAME.split(' ')[0]}`)).
      toBeInTheDocument();
  });

  it('accepts overridden wrapper class names', () => {
    const Sections = createSections(registry(), {
      sectionsClassName: 'my-sections',
      containerClassName: 'my-container',
    });
    const { container } = render(<Sections sections={[section()]} />);
    expect(container.querySelector('.my-sections')).toBeInTheDocument();
    expect(container.querySelector('.my-container')).toBeInTheDocument();
  });

  it('applies a section background through the host mapper', () => {
    const Sections = createSections(registry(), {
      sectionBg: (bg) => (bg ? `bg-${bg}` : undefined),
    });
    const { container } = render(
      <Sections
        sections={[section({ configuration: { background: 'dark' } } as never)]}
      />
    );
    expect(container.querySelector('.bg-dark')).toBeInTheDocument();
  });

  it('renders several sections in order', () => {
    const Sections = createSections(registry());
    const { container } = render(
      <Sections
        sections={[
          section({ sectionId: 'a' }),
          section({ sectionId: 'b' }),
        ]}
      />
    );
    expect(container.querySelectorAll('[data-testid="hero"]')).toHaveLength(2);
  });

  it('renders nothing for an empty section list', () => {
    const Sections = createSections(registry());
    const { container } = render(<Sections sections={[]} />);
    expect(container.querySelector('[data-testid="hero"]')).toBeNull();
  });
});

describe('createSections edit-mode markers', () => {
  it('adds no editing markers outside edit mode', () => {
    const Sections = createSections(registry());
    const { container } = render(<Sections sections={[section()]} />);
    expect(container.querySelector('[data-pb-id]')).toBeNull();
  });

  it('marks each item for the bridge in edit mode', () => {
    const Sections = createSections(registry());
    const { container } = render(<Sections sections={[section()]} editMode />);

    const item = container.querySelector('[data-pb-id="c1"]');
    expect(item).toBeInTheDocument();
    expect(item).toHaveAttribute('data-pb-type', 'content/hero');
    expect(item).toHaveAttribute('data-pb-kind', 'component');
  });

  it('puts blocks in edit mode so PBText marks its fields', () => {
    const Editable = ({ data }: { data: Record<string, unknown> }) => (
      <PBText field="title" value={String(data.title ?? '')} />
    );
    const Sections = createSections(
      buildRegistry(blocks, { 'content/hero': Editable } as never)
    );
    const { container } = render(<Sections sections={[section()]} editMode />);

    expect(container.querySelector('[data-pb-field="title"]')).toBeInTheDocument();
  });
});

describe('createSections responsive sizing', () => {
  const withSize = (size: unknown) => {
    const Sections = createSections(registry());
    const { container } = render(
      <Sections
        sections={[
          section({
            layoutElements: [
              {
                layoutElementId: 'l1',
                configuration: { mobile: true, tablet: true, desktop: true, size },
                // A column with no items renders nothing at all, so the sizing
                // classes only exist when there is something to lay out.
                items: [
                  {
                    layoutItemId: 'c1',
                    layoutItemType: 'content/hero',
                    configuration: {},
                  },
                ],
              },
            ],
          } as never),
        ]}
      />
    );
    return container.innerHTML;
  };

  it('spans the full grid by default', () => {
    expect(withSize(undefined)).toContain('col-span-12');
  });

  it('uses a plain span for a numeric size', () => {
    expect(withSize(6)).toContain('col-span-6');
  });

  it('emits a breakpoint class per device for a responsive size', () => {
    const html = withSize({ mobile: 12, tablet: 6, desktop: 4 });
    expect(html).toContain('col-span-12');
    expect(html).toContain('md:col-span-6');
    expect(html).toContain('lg:col-span-4');
  });
});
