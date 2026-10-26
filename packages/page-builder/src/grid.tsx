/**
 * The render grid. A server-component tree: no hooks, no client state. It owns layout, device
 * visibility, section backgrounds and the `data-pb-*` markers the visual-editing bridge targets;
 * the host's components own everything inside a cell.
 */

import type { CSSProperties, ReactNode } from 'react';
import { PBEditProvider } from './edit-context.js';
import { backgroundKey, slug } from './styles.js';
import type { LayoutElement, LayoutItem, LayoutSection, ResponsiveNumber, Theme } from './wire.js';

/** What a host component receives: the item's resolved settings as `data`. */
export type PageBuilderComponent = (props: { data: never; editMode?: boolean }) => ReactNode | Promise<ReactNode>;

/** Block `type` → component. Route-driven types (`product/title`, …) are ordinary entries. */
export type ComponentMap = Record<string, PageBuilderComponent>;

type Visibility = { mobile?: boolean; tablet?: boolean; desktop?: boolean } | undefined;

/** `m t d` for the devices an element is hidden on, or `undefined` when it shows everywhere. */
export function hiddenOn(v: Visibility): string | undefined {
  const hidden = [v?.mobile === false && 'm', v?.tablet === false && 't', v?.desktop === false && 'd'].filter(Boolean);
  return hidden.length ? hidden.join(' ') : undefined;
}

function colSpans(size: ResponsiveNumber | undefined): Record<string, number> {
  if (size === undefined) return { '--pb-cols-m': 12 };
  if (typeof size === 'number') return { '--pb-cols-m': size };
  return {
    '--pb-cols-m': size.mobile ?? 12,
    ...(size.tablet ? { '--pb-cols-t': size.tablet } : {}),
    ...(size.desktop ? { '--pb-cols-d': size.desktop } : {}),
  };
}

const isProduction = (): boolean => process.env.NODE_ENV === 'production';

function MissingItem({ type }: { type: string }) {
  if (isProduction()) return null;
  const style: CSSProperties = {
    margin: '.5rem 0',
    padding: '.75rem 1rem',
    border: '1px dashed #f97316',
    borderRadius: '.375rem',
    background: '#fff7ed',
    color: '#c2410c',
    fontSize: '.875rem',
  };
  return (
    <div style={style}>
      Unknown block type <b style={{ fontFamily: 'monospace' }}>{type || '(empty)'}</b> — no component is registered for it in the
      component map.
    </div>
  );
}

function Item({ item, components, editMode }: { item: LayoutItem; components: ComponentMap; editMode: boolean }) {
  const Component = components[item.layoutItemType];
  return (
    <div
      data-pb-hide={hiddenOn(item.configuration)}
      data-pb-id={editMode ? item.layoutItemId : undefined}
      data-pb-type={editMode ? item.layoutItemType : undefined}
      data-pb-kind={editMode ? 'component' : undefined}
    >
      {Component ? (
        <PBEditProvider editMode={editMode}>
          <Component data={item.configuration as never} editMode={editMode} />
        </PBEditProvider>
      ) : (
        <MissingItem type={item.layoutItemType} />
      )}
    </div>
  );
}

function Cell({ element, components, editMode }: { element: LayoutElement; components: ComponentMap; editMode: boolean }) {
  const id = element.layoutElementId;
  return (
    <div
      className="pb-cell"
      style={colSpans(element.configuration?.size) as CSSProperties}
      data-pb-hide={hiddenOn(element.configuration)}
      data-pb-id={editMode ? id : undefined}
      data-pb-kind={editMode ? 'layout' : undefined}
      data-pb-dropzone={editMode && id ? JSON.stringify({ section: 'MAIN', layoutId: id }) : undefined}
    >
      {element.items.map((item, i) => (
        <Item key={item.layoutItemId ?? i} item={item} components={components} editMode={editMode} />
      ))}
    </div>
  );
}

/** A section is hidden on a device only when every one of its elements is. */
function sectionVisibility(elements: LayoutElement[]): Visibility {
  const any = (device: 'mobile' | 'tablet' | 'desktop'): boolean => elements.some((e) => e.configuration?.[device] ?? true);
  return { mobile: any('mobile'), tablet: any('tablet'), desktop: any('desktop') };
}

export function Sections({
  sections,
  components,
  theme,
  editMode = false,
}: {
  sections: LayoutSection[];
  components: ComponentMap;
  theme?: Theme;
  editMode?: boolean;
}) {
  return (
    <div
      className="pb-sections"
      data-pb-section={editMode ? 'MAIN' : undefined}
      data-pb-kind={editMode ? 'section' : undefined}
      data-pb-dropzone={editMode ? JSON.stringify({ section: 'MAIN', layoutId: null }) : undefined}
    >
      {sections.map((section) => {
        const elements = section.layoutElements.filter((el) => el.items.length > 0);
        if (elements.length === 0) return null;
        const key = backgroundKey(theme, section.configuration?.background);
        return (
          <div
            key={section.sectionId}
            className={key ? `pb-section pb-bg-${slug(key)}` : 'pb-section'}
            data-pb-hide={hiddenOn(sectionVisibility(elements))}
            data-section-id={section.sectionId}
          >
            <div className="pb-container">
              <div className="pb-grid">
                {elements.map((element, i) => (
                  <Cell key={element.layoutElementId ?? i} element={element} components={components} editMode={editMode} />
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
