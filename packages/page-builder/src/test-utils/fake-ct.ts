/**
 * A fake commercetools backing store for the page store and the CLI commands.
 *
 * `createPageStore` takes its readers as injected functions, so nothing here needs to
 * intercept HTTP — the fake simply implements the same reader signatures over a Map, and
 * records the calls so a test can assert on *what was read*, not just what came back.
 * That matters for the store: the difference between the published fast path and the
 * preview path is which containers get touched.
 */
import type {
  ComponentsByIdsReader,
  CustomObjectReader,
} from '../page-store.js';

export type ReadCall = { container: string; key: string };

export interface FakeCt {
  /** Put a value in place, as if the editor had written it. */
  set(container: string, key: string, value: unknown): void;
  /** Register a component-instance object under the CT id a ComponentRef points at. */
  setComponentById(id: string, value: unknown): void;
  /** Reader to pass as `getCustomObjectValue`. */
  read: CustomObjectReader;
  /** Reader to pass as `getComponentsByIds`. */
  readComponentsByIds: ComponentsByIdsReader;
  /** Every `read` call in order, so tests can assert which containers were hit. */
  readCalls: ReadCall[];
  /** Every batch of ids passed to `readComponentsByIds`, in order. */
  componentReadCalls: string[][];
  reset(): void;
}

export const createFakeCt = (): FakeCt => {
  const objects = new Map<string, unknown>();
  const components = new Map<string, unknown>();
  const readCalls: ReadCall[] = [];
  const componentReadCalls: string[][] = [];

  const slot = (container: string, key: string) => `${container}::${key}`;

  return {
    set(container, key, value) {
      objects.set(slot(container, key), value);
    },
    setComponentById(id, value) {
      components.set(id, value);
    },
    read: async (container: string, key: string) => {
      readCalls.push({ container, key });
      // A missing custom object reads as undefined, the way the real client
      // reports a 404 to callers that tolerate it.
      return objects.get(slot(container, key));
    },
    readComponentsByIds: async (ids: string[]) => {
      componentReadCalls.push([...ids]);
      // Ids with no object are omitted, matching a CT `id in (...)` query — the
      // store has to cope with a ref pointing at something deleted.
      return ids
        .filter((id) => components.has(id))
        .map((id) => ({ id, value: components.get(id) }));
    },
    readCalls,
    componentReadCalls,
    reset() {
      objects.clear();
      components.clear();
      readCalls.length = 0;
      componentReadCalls.length = 0;
    },
  };
};
