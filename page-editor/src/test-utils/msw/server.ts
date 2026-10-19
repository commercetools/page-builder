/**
 * The MSW server every app test shares.
 *
 * `onUnhandledRequest: 'error'` is the point of this file: without it a request the
 * handlers do not cover resolves to nothing, the hook under test reports "no data",
 * and the test reads as a logic failure. Failing loudly names the operation instead.
 */
import { setupServer } from 'msw/node';
import type { RequestHandler } from 'msw';
import { CustomObjectStore } from './custom-object-store';
import { createCustomObjectHandlers } from './handlers';

/** Shared store — reset between tests by `installMockServer`. */
export const customObjects = new CustomObjectStore();

export const server = setupServer(...createCustomObjectHandlers(customObjects));

/**
 * Wire the server into a suite's lifecycle. Call at the top level of a spec file.
 *
 * @returns the backing store, to seed in `beforeEach` and assert on afterwards
 */
export const installMockServer = (extraHandlers: RequestHandler[] = []) => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  beforeEach(() => {
    if (extraHandlers.length > 0) server.use(...extraHandlers);
  });

  afterEach(() => {
    server.resetHandlers();
    customObjects.reset();
  });

  afterAll(() => {
    server.close();
  });

  return customObjects;
};
