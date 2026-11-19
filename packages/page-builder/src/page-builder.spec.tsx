import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BridgeMount } from './bridge-mount.js';
import type { ComponentMap } from './grid.js';
import { PageBuilder, toSearch, type PageBuilderProps } from './page-builder.js';

const Hero: ComponentMap[string] = ({ data }) => <h1>{(data as { title: string }).title}</h1>;
const components: ComponentMap = { 'content/hero': Hero };

const tree = (extra: Record<string, unknown> = {}) => ({
  wireVersion: 1,
  pageId: 'home',
  preview: false,
  editMode: false,
  sections: [
    {
      sectionId: 's1',
      layoutElements: [
        {
          layoutElementId: 'e1',
          configuration: { size: 12 },
          items: [{ layoutItemId: 'i1', layoutItemType: 'content/hero', configuration: { title: 'Hello' } }],
        },
      ],
    },
  ],
  ...extra,
});

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const base = {
  components,
  path: '/en-us',
  context: { locale: 'en-US', currency: 'USD', country: 'US', store: 'gap' },
  serviceUrl: 'https://svc.test/service',
};

const fetchOf = (impl: (url: string) => Response | Promise<Response>) =>
  vi.fn(async (url: string | URL | Request) => impl(String(url))) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

const mount = async (props: Partial<PageBuilderProps> & { fetch: typeof fetch }) => {
  const node = await PageBuilder({ ...base, ...props });
  return { node, html: renderToStaticMarkup(<>{node}</>) };
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('toSearch', () => {
  it('serialises records, repeated values and URLSearchParams; skips undefined', () => {
    expect(toSearch({ a: '1', b: ['x', 'y'], c: undefined })).toBe('a=1&b=x&b=y');
    expect(toSearch(new URLSearchParams('p=1&q=2'))).toBe('p=1&q=2');
    expect(toSearch(undefined)).toBe('');
    expect(toSearch({})).toBe('');
  });

  it('encodes values', () => {
    expect(toSearch({ q: 'a b&c' })).toBe('q=a+b%26c');
  });
});

describe('<PageBuilder>', () => {
  it('renders the grid and its CSS from the render tree', async () => {
    const { html } = await mount({ fetch: fetchOf(() => json(tree({ theme: { containerMaxWidth: '70rem' } }))) });
    expect(html).toContain('<style data-pb-styles="true">');
    expect(html).toContain('--pb-container-max:70rem');
    expect(html).toContain('<h1>Hello</h1>');
    expect(html).toContain('class="pb-sections"');
  });

  it('forwards path, market, store and the host query string to the service', async () => {
    const f = fetchOf(() => json(tree()));
    await mount({ fetch: f, searchParams: { pb_preview: 'tok', 'facet.color': ['red', 'blue'], sort: 'newest' } });
    const url = new URL(f.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/service/v1/render');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      path: '/en-us',
      locale: 'en-US',
      currency: 'USD',
      country: 'US',
      store: 'gap',
      search: 'pb_preview=tok&facet.color=red&facet.color=blue&sort=newest',
    });
  });

  it('sends the render key and origin from props', async () => {
    const f = fetchOf(() => json(tree()));
    await mount({ fetch: f, renderKey: 'k', origin: 'https://shop.test' });
    const init = f.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({ 'x-pb-render-key': 'k', 'x-pb-origin': 'https://shop.test' });
  });

  describe('fallback', () => {
    const Fallback = <p>native page</p>;

    it('renders the fallback when there is no page', async () => {
      const { html } = await mount({ fetch: fetchOf(() => json({ error: { code: 'page_not_found' } }, 404)), fallback: Fallback });
      expect(html).toBe('<p>native page</p>');
    });

    it('renders nothing without a fallback', async () => {
      const { node } = await mount({ fetch: fetchOf(() => json({ error: { code: 'page_not_found' } }, 404)) });
      expect(node).toBeNull();
    });

    it.each([
      ['server error', () => json({}, 500)],
      ['unauthorized', () => json({}, 401)],
      ['wire version', () => json({ error: { code: 'wire_version_unsupported', message: 'supported versions: 2' } }, 426)],
    ])('renders the fallback and reports on %s', async (_name, respond) => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { html } = await mount({ fetch: fetchOf(respond), fallback: Fallback });
      expect(html).toBe('<p>native page</p>');
      expect(log).toHaveBeenCalledOnce();
      expect(String(log.mock.calls[0][0])).toContain('[page-builder] render failed');
    });

    describe('errorFallback', () => {
      const Unavailable = <p>unavailable</p>;

      it('is used for a failure while `fallback` is kept for a missing page', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const missing = await mount({
          fetch: fetchOf(() => json({ error: { code: 'page_not_found' } }, 404)),
          fallback: Fallback,
          errorFallback: Unavailable,
        });
        expect(missing.html).toBe('<p>native page</p>');
        const down = await mount({ fetch: fetchOf(() => json({}, 503)), fallback: Fallback, errorFallback: Unavailable });
        expect(down.html).toBe('<p>unavailable</p>');
      });

      it('is used when the service is unreachable', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const refused = vi.fn(async () => {
          throw new TypeError('fetch failed');
        }) as unknown as typeof fetch;
        const { html } = await mount({ fetch: refused, fallback: Fallback, errorFallback: Unavailable });
        expect(html).toBe('<p>unavailable</p>');
      });

      it('treats a 404 that is not "page_not_found" as an error, and says so', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { html } = await mount({
          fetch: fetchOf(() => json({ error: { code: 'not_found', message: 'Route not found' } }, 404)),
          fallback: Fallback,
          errorFallback: Unavailable,
        });
        expect(html).toBe('<p>unavailable</p>');
        expect(String(log.mock.calls[0][0])).toContain('bad_route (HTTP 404): Route not found');
      });

      it('defaults to `fallback`', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const { html } = await mount({ fetch: fetchOf(() => json({}, 500)), fallback: Fallback });
        expect(html).toBe('<p>native page</p>');
      });
    });

    it('includes the service message for a wire version mismatch', async () => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      await mount({ fetch: fetchOf(() => json({ error: { code: 'wire_version_unsupported', message: 'supported versions: 2' } }, 426)) });
      expect(String(log.mock.calls[0][0])).toContain('wire_version (HTTP 426): supported versions: 2');
    });

    it('renders the fallback when the service times out, without waiting', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const never = vi.fn((_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_res, rej) => init?.signal?.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' }))))
      ) as unknown as typeof fetch;
      const { html } = await mount({ fetch: never, fallback: Fallback, timeoutMs: 10 });
      expect(html).toBe('<p>native page</p>');
    });
  });

  describe('configuration errors', () => {
    it('throws in development so the mistake is loud', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('PB_SERVICE_URL', '');
      await expect(PageBuilder({ ...base, serviceUrl: undefined, fetch: fetchOf(() => json(tree())) })).rejects.toThrow('PB_SERVICE_URL is not set');
    });

    it('renders the fallback in production and logs', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('PB_SERVICE_URL', '');
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      const f = fetchOf(() => json(tree()));
      const node = await PageBuilder({ ...base, serviceUrl: undefined, fetch: f, fallback: <p>safe</p> });
      expect(renderToStaticMarkup(<>{node}</>)).toBe('<p>safe</p>');
      expect(f).not.toHaveBeenCalled();
      expect(String(log.mock.calls[0][0])).toContain('PB_SERVICE_URL is not set');
    });
  });

  describe('edit mode', () => {
    const find = (node: ReactNode): ReactElement | undefined => {
      const out: ReactElement[] = [];
      const walk = (n: ReactNode) => {
        Children.forEach(n, (c) => {
          if (!isValidElement(c)) return;
          out.push(c as ReactElement);
          walk((c.props as { children?: ReactNode }).children);
        });
      };
      walk(node);
      return out.find((e) => e.type === BridgeMount);
    };

    it('mounts the bridge with the origins and manifest the service returned', async () => {
      const manifest = [{ type: 'content/hero', inlineTextFields: ['title'] }];
      const { node, html } = await mount({
        fetch: fetchOf(() => json(tree({ preview: true, editMode: true, allowedOrigins: ['https://mc.test'], manifest }))),
      });
      const bridge = find(node);
      expect(bridge?.props).toEqual({ allowedOrigins: ['https://mc.test'], manifest });
      expect(html).toContain('data-pb-id="e1"'); // edit-mode markers on
    });

    it('defaults the bridge props when the service omits them', async () => {
      const { node } = await mount({ fetch: fetchOf(() => json(tree({ editMode: true }))) });
      expect(find(node)?.props).toEqual({ allowedOrigins: [], manifest: [] });
    });

    it('does not mount the bridge outside edit mode', async () => {
      const { node, html } = await mount({ fetch: fetchOf(() => json(tree({ preview: true }))) });
      expect(find(node)).toBeUndefined();
      expect(html).not.toContain('data-pb-id');
    });
  });
});
