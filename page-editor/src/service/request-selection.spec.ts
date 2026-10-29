import { createDirectRequest } from './direct';
import { createForwardRequest } from './forward-to';
import { serviceRequestFor, setServiceRequestForTests } from './transport';

jest.mock('./direct', () => ({ createDirectRequest: jest.fn() }));
jest.mock('./forward-to', () => ({ createForwardRequest: jest.fn() }));

const direct = jest.fn();
const forward = jest.fn();
const config = { origin: 'http://localhost:8080', basePath: '/service' };
const withToken = { ...config, devToken: 'dev-editor-token-1234' };

const env = process.env as Record<string, string | undefined>;
const nodeEnv = env.NODE_ENV;

beforeEach(() => {
  setServiceRequestForTests(null);
  (createDirectRequest as jest.Mock).mockReset().mockReturnValue(direct);
  (createForwardRequest as jest.Mock).mockReset().mockReturnValue(forward);
});
afterEach(() => {
  env.NODE_ENV = nodeEnv;
});

describe('serviceRequestFor', () => {
  it('goes straight to the service in a development build that has a token', () => {
    env.NODE_ENV = 'development';
    expect(serviceRequestFor(withToken)).toBe(direct);
    expect(createDirectRequest).toHaveBeenCalledWith(
      withToken,
      'dev-editor-token-1234'
    );
    expect(createForwardRequest).not.toHaveBeenCalled();
  });

  it('keeps using the gateway in development without a token', () => {
    env.NODE_ENV = 'development';
    expect(serviceRequestFor(config)).toBe(forward);
    expect(createDirectRequest).not.toHaveBeenCalled();
  });

  it.each(['production', 'test'])(
    'ignores the token outside development (NODE_ENV=%s)',
    (mode) => {
      env.NODE_ENV = mode;
      expect(serviceRequestFor(withToken)).toBe(forward);
      expect(createDirectRequest).not.toHaveBeenCalled();
    }
  );

  it('prefers the in-process stand-in used by tests', () => {
    env.NODE_ENV = 'development';
    const stand = jest.fn();
    setServiceRequestForTests(stand);
    expect(serviceRequestFor(withToken)).toBe(stand);
  });
});
