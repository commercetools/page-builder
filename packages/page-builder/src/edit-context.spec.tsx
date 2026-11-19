// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Editable, PBEditProvider, PBText, usePBEditMode } from './edit-context.js';

const ReadMode = () => <span data-testid="mode">{String(usePBEditMode())}</span>;

describe('usePBEditMode', () => {
  it('is off with no provider', () => {
    render(<ReadMode />);
    expect(screen.getByTestId('mode')).toHaveTextContent('false');
  });

  it('reflects the provider', () => {
    render(
      <PBEditProvider editMode>
        <ReadMode />
      </PBEditProvider>
    );
    expect(screen.getByTestId('mode')).toHaveTextContent('true');
  });

  it('can be turned off explicitly', () => {
    render(
      <PBEditProvider editMode={false}>
        <ReadMode />
      </PBEditProvider>
    );
    expect(screen.getByTestId('mode')).toHaveTextContent('false');
  });
});

describe('PBText outside edit mode', () => {
  it('renders the value in a span by default', () => {
    const { container } = render(<PBText field="title" value="Welcome" />);
    expect(container.querySelector('span')).toHaveTextContent('Welcome');
  });

  it('carries no editing marker', () => {
    const { container } = render(<PBText field="title" value="Welcome" />);
    expect(container.querySelector('[data-pb-field]')).toBeNull();
  });

  it('renders as another element when asked', () => {
    const { container } = render(<PBText field="title" value="Welcome" as="h1" />);
    expect(container.querySelector('h1')).toHaveTextContent('Welcome');
  });

  it('passes a className through', () => {
    const { container } = render(
      <PBText field="title" value="Welcome" className="headline" />
    );
    expect(container.querySelector('.headline')).toBeInTheDocument();
  });
});

describe('PBText in edit mode', () => {
  const inEditMode = (ui: React.ReactNode) =>
    render(<PBEditProvider editMode>{ui}</PBEditProvider>);

  it('marks the field for the bridge to attach to', () => {
    const { container } = inEditMode(<PBText field="title" value="Welcome" />);
    expect(container.querySelector('[data-pb-field="title"]')).toBeInTheDocument();
  });

  it('marks an HTML field too', () => {
    const { container } = inEditMode(
      <PBText field="body" value="<p>Hi</p>" html />
    );
    expect(container.querySelector('[data-pb-field="body"]')).toBeInTheDocument();
  });
});

describe('PBText HTML sanitising', () => {
  const html = (value: string) => {
    const { container } = render(<PBText field="body" value={value} html />);
    return container.innerHTML;
  };

  it('renders allowed markup', () => {
    expect(html('<p>Hello <strong>world</strong></p>')).toContain(
      '<strong>world</strong>'
    );
  });

  it('keeps a link with its href', () => {
    expect(html('<a href="https://example.test">link</a>')).toContain(
      'href="https://example.test"'
    );
  });

  it('keeps an image with its attributes', () => {
    expect(html('<img src="/a.png" alt="A">')).toContain('alt="A"');
  });

  it('strips a script tag and its contents', () => {
    const out = html('<p>ok</p><script>alert(1)</script>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert(1)');
    expect(out).toContain('ok');
  });

  it('strips an inline event handler', () => {
    expect(html('<p onclick="alert(1)">text</p>')).not.toContain('onclick');
  });

  it('strips a javascript: URL', () => {
    expect(html('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:');
  });

  it('strips an iframe and its contents', () => {
    const out = html('<iframe src="https://evil.test">inner</iframe>');
    expect(out).not.toContain('iframe');
    expect(out).not.toContain('inner');
  });

  it('strips a style block', () => {
    expect(html('<style>body{display:none}</style><p>ok</p>')).not.toContain(
      'display:none'
    );
  });

  it('strips an object and embed', () => {
    expect(html('<object data="x"></object>')).not.toContain('<object');
    expect(html('<embed src="x">')).not.toContain('<embed');
  });

  it('escapes a disallowed tag instead of rendering it', () => {
    // Escaped rather than deleted: the markup shows as inert text, so the
    // handler never becomes a real attribute.
    const out = html('<svg onload="alert(1)"></svg>');
    expect(out).toContain('&lt;svg');
    expect(out).not.toContain('<svg');
  });

  it('renders plain text unchanged', () => {
    expect(html('just text')).toContain('just text');
  });
});

describe('Editable alias', () => {
  it('is the same component as PBText', () => {
    expect(Editable).toBe(PBText);
  });
});
