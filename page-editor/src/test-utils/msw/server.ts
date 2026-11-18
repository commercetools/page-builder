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
import { setServiceRequestForTests } from '../../service/transport';
import {
  clearGatewayFailures,
  createStoreGateway,
  injectGatewayFailure,
} from './store-gateway';
import { failureOf } from './handlers';

/** Shared store — reset between tests by `installMockServer`. */
export const customObjects = new CustomObjectStore();

export const server = setupServer(...createCustomObjectHandlers(customObjects));

// Route failure injection (`failOperation`, `networkErrorOn`) to the service gateway as well.
const originalUse = server.use.bind(server);
server.use = (...handlers) => {
  for (const handler of handlers) {
    const failure = failureOf(handler);
    if (failure) injectGatewayFailure(failure);
  }
  originalUse(...handlers);
};
const resetHandlers = server.resetHandlers.bind(server);
server.resetHandlers = (...next) => {
  clearGatewayFailures();
  resetHandlers(...next);
};

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
    if (process.env.PB_TEST_TRANSPORT === 'service') {
      setServiceRequestForTests(createStoreGateway(customObjects));
    }
    if (extraHandlers.length > 0) server.use(...extraHandlers);
  });

  afterEach(() => {
    setServiceRequestForTests(null);
    server.resetHandlers();
    customObjects.reset();
  });

  afterAll(() => {
    server.close();
  });

  return customObjects;
};
