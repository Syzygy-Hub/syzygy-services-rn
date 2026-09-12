import { createNetworkRequest, SyzygyErrorCode } from 'syzygy-foundation-rn';

import { FetchNetworkClient, NetworkError } from '../../networking/NetworkClient';
import type { RequestInterceptor } from '../../networking/NetworkClient';

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
});
