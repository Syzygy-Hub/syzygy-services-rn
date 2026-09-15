import { createNetworkRequest, SyzygyErrorCode } from 'syzygy-foundation-rn';
import type { LoggerProtocol } from 'syzygy-foundation-rn';

import { FetchNetworkClient, NetworkError } from '../../networking/NetworkClient';
import type { RequestInterceptor } from '../../networking/NetworkClient';

// ---------------------------------------------------------------------------
// Minimal mock logger
// ---------------------------------------------------------------------------

function makeMockLogger(): LoggerProtocol & {
  debugCalls: string[];
  errorCalls: string[];
} {
  const debugCalls: string[] = [];
  const errorCalls: string[] = [];
  return {
    debugCalls,
    errorCalls,
    log: jest.fn(),
    debug: (msg: string) => {
      debugCalls.push(msg);
    },
    info: jest.fn(),
    warning: jest.fn(),
    error: (msg: string) => {
      errorCalls.push(msg);
    },
    critical: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// fetch mock helpers
// ---------------------------------------------------------------------------

function mockFetch(statusCode: number, body: string, headers: Record<string, string> = {}): void {
  global.fetch = jest.fn().mockResolvedValueOnce({
    status: statusCode,
    arrayBuffer: async (): Promise<ArrayBuffer> => new TextEncoder().encode(body).buffer,
    headers: {
      forEach: (cb: (v: string, k: string) => void): void => {
        Object.entries(headers).forEach(([k, v]) => cb(v, k));
      },
    },
  } as unknown as Response);
}

function mockFetchFailure(error: Error): void {
  global.fetch = jest.fn().mockRejectedValueOnce(error);
}

function mockFetchAbort(): void {
  global.fetch = jest.fn().mockImplementationOnce(
    (_url: unknown, options: { signal?: AbortSignal }) =>
      new Promise<never>((_, reject) => {
        options?.signal?.addEventListener('abort', () => {
          const err = new Error('AbortError');
          err.name = 'AbortError';
          reject(err);
        });
      }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FetchNetworkClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('executes a successful GET request and returns response', async () => {
    mockFetch(200, '{"ok":true}');
    const client = new FetchNetworkClient();
    const req = createNetworkRequest({ url: 'https://example.com', method: 'GET', headers: {} });
    const res = await client.execute(req);
    expect(res.statusCode).toBe(200);
    expect(res.isSuccess).toBe(true);
    expect(new TextDecoder().decode(res.data)).toBe('{"ok":true}');
  });

  it('executes a POST request', async () => {
    mockFetch(201, '{"id":"abc"}');
    const client = new FetchNetworkClient();
    const body = new TextEncoder().encode(JSON.stringify({ name: 'test' }));
    const req = createNetworkRequest({
      url: 'https://example.com/items',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const res = await client.execute(req);
    expect(res.statusCode).toBe(201);
    expect(res.isSuccess).toBe(true);
  });

  it('throws NetworkError with unauthenticated code on 401', async () => {
    mockFetch(401, 'Unauthorized');
    const client = new FetchNetworkClient({ maxRetries: 0 });
    const req = createNetworkRequest({ url: 'https://example.com', method: 'GET', headers: {} });
    await expect(client.execute(req)).rejects.toMatchObject({
      code: SyzygyErrorCode.unauthenticated,
    });
  });

  it('throws NetworkError with timeout code on request abort', async () => {
    mockFetchAbort();
    const client = new FetchNetworkClient({ maxRetries: 0 });
    const req = createNetworkRequest({
      url: 'https://example.com',
      method: 'GET',
      headers: {},
      timeoutSeconds: 0.01,
    });
    await expect(client.execute(req)).rejects.toMatchObject({
      code: SyzygyErrorCode.timeout,
    });
  }, 10000);

  it('retries on 5xx and succeeds on second attempt', async () => {
    // First call: 500, second call: 200
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        status: 500,
        arrayBuffer: async (): Promise<ArrayBuffer> => new Uint8Array().buffer,
        headers: { forEach: jest.fn() },
      } as unknown as Response)
      .mockResolvedValueOnce({
        status: 200,
        arrayBuffer: async (): Promise<ArrayBuffer> => new TextEncoder().encode('ok').buffer,
        headers: { forEach: jest.fn() },
      } as unknown as Response);

    const client = new FetchNetworkClient({ maxRetries: 3, retryBaseDelayMs: 1 });
    const req = createNetworkRequest({ url: 'https://example.com', method: 'GET', headers: {} });
    const res = await client.execute(req);
    expect(res.statusCode).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('exhausts retries and throws NetworkError on persistent 5xx', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 503,
      arrayBuffer: async (): Promise<ArrayBuffer> => new Uint8Array().buffer,
      headers: { forEach: jest.fn() },
    } as unknown as Response);

    const client = new FetchNetworkClient({ maxRetries: 2, retryBaseDelayMs: 1 });
    const req = createNetworkRequest({ url: 'https://example.com', method: 'GET', headers: {} });
    await expect(client.execute(req)).rejects.toMatchObject({
      code: SyzygyErrorCode.serverError,
    });
    expect(global.fetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('applies request interceptors in order', async () => {
    mockFetch(200, 'ok');
    const calls: string[] = [];

    const interceptorA: RequestInterceptor = {
      intercept: (req) => {
        calls.push('A');
        return req;
      },
    };
    const interceptorB: RequestInterceptor = {
      intercept: (req) => {
        calls.push('B');
        return req;
      },
    };

    const client = new FetchNetworkClient({ interceptors: [interceptorA, interceptorB] });
    const req = createNetworkRequest({ url: 'https://example.com', method: 'GET', headers: {} });
    await client.execute(req);
    expect(calls).toEqual(['A', 'B']);
  });

  it('interceptor can modify request headers', async () => {
    let capturedHeaders: Record<string, string> | undefined;
    global.fetch = jest
      .fn()
      .mockImplementationOnce((_url: unknown, options: { headers?: Record<string, string> }) => {
        capturedHeaders = options.headers as Record<string, string>;
        return Promise.resolve({
          status: 200,
          arrayBuffer: async (): Promise<ArrayBuffer> => new Uint8Array().buffer,
          headers: { forEach: jest.fn() },
        });
      });

    const interceptor: RequestInterceptor = {
      intercept: (req) => ({ ...req, headers: { ...req.headers, 'X-Token': 'secret' } }),
    };

    const client = new FetchNetworkClient({ interceptors: [interceptor] });
    const req = createNetworkRequest({ url: 'https://example.com', method: 'GET', headers: {} });
    await client.execute(req);
    expect(capturedHeaders?.['X-Token']).toBe('secret');
  });

  it('throws NetworkError with networkUnavailable on fetch rejection', async () => {
    mockFetchFailure(new Error('Network failed'));
    const client = new FetchNetworkClient({ maxRetries: 0 });
    const req = createNetworkRequest({ url: 'https://example.com', method: 'GET', headers: {} });
    await expect(client.execute(req)).rejects.toBeInstanceOf(NetworkError);
  });

  // -------------------------------------------------------------------------
  // Logger tests
  // -------------------------------------------------------------------------

  it('logs request and response when logger is provided', async () => {
    mockFetch(200, 'ok');
    const logger = makeMockLogger();
    const client = new FetchNetworkClient({ logger });
    const req = createNetworkRequest({
      url: 'https://example.com/data',
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    await client.execute(req);
    expect(
      logger.debugCalls.some((m) => m.includes('GET') && m.includes('https://example.com/data')),
    ).toBe(true);
    expect(logger.debugCalls.some((m) => m.includes('200'))).toBe(true);
  });

  it('excludes Authorization header from request log', async () => {
    mockFetch(200, 'ok');
    const logger = makeMockLogger();
    const client = new FetchNetworkClient({ logger });
    const req = createNetworkRequest({
      url: 'https://example.com',
      method: 'GET',
      headers: { Authorization: 'Bearer secret-token', 'X-Custom': 'value' },
    });
    await client.execute(req);
    // No logged message should mention 'Authorization' value
    const allLogs = logger.debugCalls.join('\n');
    expect(allLogs).not.toContain('secret-token');
  });

  it('logs error when request fails', async () => {
    mockFetchFailure(new Error('Network failed'));
    const logger = makeMockLogger();
    const client = new FetchNetworkClient({ maxRetries: 0, logger });
    const req = createNetworkRequest({ url: 'https://example.com', method: 'GET', headers: {} });
    await expect(client.execute(req)).rejects.toBeInstanceOf(NetworkError);
    expect(logger.errorCalls.length).toBeGreaterThan(0);
  });

  it('does not call logger when logger is undefined', async () => {
    mockFetch(200, 'ok');
    // No logger provided — should not throw, no side effects
    const client = new FetchNetworkClient();
    const req = createNetworkRequest({ url: 'https://example.com', method: 'GET', headers: {} });
    await expect(client.execute(req)).resolves.toBeDefined();
  });

  // -------------------------------------------------------------------------
  // dispose() tests
  // -------------------------------------------------------------------------

  it('execute() throws NetworkError after dispose()', async () => {
    const client = new FetchNetworkClient();
    client.dispose();
    const req = createNetworkRequest({ url: 'https://example.com', method: 'GET', headers: {} });
    await expect(client.execute(req)).rejects.toBeInstanceOf(NetworkError);
    await expect(client.execute(req)).rejects.toMatchObject({
      message: 'NetworkClient has been disposed',
    });
  });

  it('dispose() called multiple times is a safe no-op', () => {
    const client = new FetchNetworkClient();
    expect(() => {
      client.dispose();
      client.dispose();
      client.dispose();
    }).not.toThrow();
  });
});
