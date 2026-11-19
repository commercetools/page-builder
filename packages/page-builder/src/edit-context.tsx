'use client';
/**
 * Inline-text editing primitives for host block components.
 *
 * `PBText` renders a settings value and, in edit mode, marks it with `data-pb-field` so the
 * visual-editing bridge can make it contentEditable and round-trip edits. Edit mode is read
 * from context (set by the grid's `Item` wrapper) so block components never thread an
 * `editMode` prop down to each text node. React Context can't cross the RSC boundary, so
 * this is a client module; the server `Item` wrapper renders `<PBEditProvider>` around each
 * block, and any `PBText` a (client) block renders reads the flag from it.
 */

import { createContext, useContext } from 'react';
import type { ElementType, ReactNode } from 'react';
import { FilterXSS } from 'xss';

const PBEditContext = createContext<{ editMode: boolean }>({ editMode: false });

// The context value has exactly two shapes, and a provider wraps every block on the page.
// Two shared constants keep the identity stable across all of them, so toggling one block
// never re-renders the `PBText` nodes inside the others.
const EDIT_MODE_ON = { editMode: true };
const EDIT_MODE_OFF = { editMode: false };

export function PBEditProvider({
  editMode,
  children,
}: {
  editMode: boolean;
  children: ReactNode;
}) {
  return (
    <PBEditContext.Provider value={editMode ? EDIT_MODE_ON : EDIT_MODE_OFF}>
      {children}
    </PBEditContext.Provider>
  );
}

/** True inside a block component being rendered in edit mode. */
export function usePBEditMode(): boolean {
  return useContext(PBEditContext).editMode;
}

/**
 * Rich-text values are authored in the Merchant Center and stored in commercetools, so by
 * the time a storefront renders one it is attacker-influenced input as far as this package
 * is concerned: an author with content permissions must not be able to run script in a
 * shopper's browser. Everything handed to `dangerouslySetInnerHTML` below goes through this
 * allowlist first.
 *
 * `xss` is a pure-string sanitiser, so the same code path works during server rendering and
 * in the browser without pulling a DOM implementation into this otherwise dependency-free
 * package.
 */
const richTextSanitizer = new FilterXSS({
  whiteList: {
    p: [], br: [], span: ['class'], div: ['class'],
    strong: [], b: [], em: [], i: [], u: [], s: [], mark: [], small: [],
    sub: [], sup: [], code: [], pre: [], blockquote: [], hr: [],
    h1: [], h2: [], h3: [], h4: [], h5: [], h6: [],
    ul: [], ol: ['start'], li: [],
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    table: [], thead: [], tbody: [], tfoot: [], tr: [], th: ['colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
  },
  // Drop the contents of anything script-bearing rather than leaving the text behind.
  stripIgnoreTagBody: ['script', 'style', 'iframe', 'object', 'embed'],
});

/** Sanitise a rich-text value for `dangerouslySetInnerHTML`. */
const sanitizeRichText = (value: string): string =>
  richTextSanitizer.process(value);

export interface PBTextProps {
  /** The block schema field key — becomes `data-pb-field` in edit mode. */
  field: string;
  /** The (already localized) value to render. */
  value: string;
  /** Element to render as. Default `span`. */
  as?: ElementType;
  /**
   * Render `value` as HTML (for rich-text / markup fields) rather than plain text.
   * The value is sanitised against an allowlist before it reaches the DOM, so script,
   * event-handler attributes and `javascript:` URLs are stripped.
   */
  html?: boolean;
  className?: string;
}

/**
 * Render an editable text/HTML field. Outside edit mode it is just the value in the given
 * element; in edit mode it additionally carries `data-pb-field` for the bridge to attach to.
 */
export function PBText({ field, value, as, html, className }: PBTextProps) {
  const editMode = usePBEditMode();
  const Tag = (as ?? 'span') as ElementType;
  const pbField = editMode ? field : undefined;
  if (html) {
    return (
      <Tag
        className={className}
        data-pb-field={pbField}
        dangerouslySetInnerHTML={{ __html: sanitizeRichText(value) }}
      />
    );
  }
  return (
    <Tag className={className} data-pb-field={pbField}>
      {value}
    </Tag>
  );
}

/** Alias — some hosts prefer the name `Editable`. */
export const Editable = PBText;
