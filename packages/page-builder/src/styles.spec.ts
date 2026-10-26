import { describe, expect, it } from 'vitest';
import { backgroundKey, buildCss, safeCssValue, slug } from './styles.js';

describe('safeCssValue', () => {
  it.each(['70rem', '#111', 'rgb(0, 0, 0)', 'calc(100% - 2rem)', '1.5rem', 'hsl(210 40% 98%)', 'var(--x)'])('allows %s', (v) => {
    expect(safeCssValue(v)).toBe(v);
  });

  it.each([
    'red; } body { display: none',
    'url(https://evil.example/x.png)',
    'URL (x)',
    'expression(alert(1))',
    '</style><script>alert(1)</script>',
    '@import "x"',
    'a\\62 c',
    '/* hi */ red',
    '{}',
    '',
    '   ',
  ])('rejects %j', (v) => {
    expect(safeCssValue(v)).toBeUndefined();
  });

  it('rejects non-strings', () => {
    expect(safeCssValue(12)).toBeUndefined();
    expect(safeCssValue(undefined)).toBeUndefined();
    expect(safeCssValue({})).toBeUndefined();
  });

  it('trims whitespace', () => {
    expect(safeCssValue('  2rem ')).toBe('2rem');
  });
});

describe('slug / backgroundKey', () => {
  it('makes class-safe tokens', () => {
    expect(slug('Dark Blue')).toBe('dark-blue');
    expect(slug('  --Sage_Green!! ')).toBe('sage-green');
    expect(slug('!!!')).toBe('');
  });

  it('finds a theme key case-insensitively', () => {
    const theme = { sectionBackgrounds: { Dark: { background: '#111' } } };
    expect(backgroundKey(theme, 'dark')).toBe('Dark');
    expect(backgroundKey(theme, 'DARK')).toBe('Dark');
    expect(backgroundKey(theme, 'sage')).toBeUndefined();
    expect(backgroundKey(theme, undefined)).toBeUndefined();
    expect(backgroundKey(undefined, 'dark')).toBeUndefined();
    expect(backgroundKey({}, 'dark')).toBeUndefined();
  });
});

describe('buildCss', () => {
  it('emits the grid, responsive spans and device visibility with no theme', () => {
    const css = buildCss();
    expect(css).toContain('.pb-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr))');
    expect(css).toContain('@media(min-width:768px){.pb-cell{grid-column:span var(--pb-cols-t');
    expect(css).toContain('@media(min-width:1024px){.pb-cell{grid-column:span var(--pb-cols-d');
    expect(css).toContain('@media(max-width:767px){[data-pb-hide~="m"]{display:none!important}}');
    expect(css).toContain('@media(min-width:768px) and (max-width:1023px){[data-pb-hide~="t"]');
    expect(css).toContain('@media(min-width:1024px){[data-pb-hide~="d"]');
    expect(css).not.toContain('--pb-container-max:');
  });

  it('applies theme tokens as custom properties and section background classes', () => {
    const css = buildCss({
      containerMaxWidth: '70rem',
      containerPaddingX: '2rem',
      gap: { row: '1rem', column: '2rem' },
      sectionBackgrounds: { Dark: { background: '#111', color: '#fff' }, Sage: { background: 'rgb(1 2 3)' } },
    });
    expect(css).toContain('--pb-container-max:70rem;--pb-container-px:2rem;--pb-gap-row:1rem;--pb-gap-column:2rem;');
    expect(css).toContain('.pb-bg-dark{background:#111;color:#fff}');
    expect(css).toContain('.pb-bg-sage{background:rgb(1 2 3);}');
  });

  it('drops unsafe theme values instead of emitting them', () => {
    const css = buildCss({
      containerMaxWidth: '1rem; } body { display:none',
      sectionBackgrounds: { Evil: { background: 'url(//evil/x)' }, 'Ok': { background: '#000', color: 'red;}' } },
    });
    expect(css).not.toMatch(/body\s*\{/);
    expect(css).not.toContain('url(');
    expect(css).not.toContain('pb-bg-evil');
    expect(css).toContain('.pb-bg-ok{background:#000;}');
  });

  it('skips a background whose key has no class-safe token', () => {
    expect(buildCss({ sectionBackgrounds: { '!!!': { background: '#000' } } })).not.toContain('pb-bg-');
  });
});
