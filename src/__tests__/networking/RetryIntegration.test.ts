/**
 * Integration tests for FetchNetworkClient retry behaviour.
 *
 * Uses a mock fetch implementation that counts calls.  Delays are set to 0 ms
 * so retries run synchronously in the microtask queue without needing fake timers.
 */
import { createNetworkRequest } from 'syzygy-foundation-rn';

import { FetchNetworkClient } from '../../networking/NetworkClient';
import type { BackoffClock } from '../../networking/NetworkClient';

// ---------------------------------------------------------------------------
// Mock fetch factories
// ---------------------------------------------------------------------------

/** Returns a mock fetch that always responds with the given status code. */
function makeAlwaysFail(status: number): jest.Mock {
  return jest.fn().mockImplementation(() =>
    Promise.resolve({
      status,
      arrayBuffer: async (): Promise<ArrayBuffer> => new TextEncoder().encode('err').buffer,
      headers: { forEach: (): void => {} },
    }),
  );
}

/** Returns a mock fetch that fails `failCount` times then succeeds with 200. */
function makeRecoverAfter(failCount: number): jest.Mock {
  let calls = 0;
  return jest.fn().mockImplementation(() => {
    calls++;
    const status = calls <= failCount ? 500 : 200;
    return Promise.resolve({
      status,
      arrayBuffer: async (): Promise<ArrayBuffer> =>
        new TextEncoder().encode(calls <= failCount ? 'err' : 'ok').buffer,
      headers: { forEach: (): void => {} },
    });
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest() {
  return createNetworkRequest({
    url: 'https://example.com/api',
    method: 'GET',
    headers: {},
  });
}

/** Stub that records scheduled delays without actually waiting. */
function installDelayStub(): { delays: number[] } {
  const delays: number[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(global, 'setTimeout').mockImplementation((fn: any, ms?: number) => {
    if (typeof ms === 'number' && ms > 0) delays.push(ms);
    // Run immediately
    fn();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  });
  return { delays };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FetchNetworkClient — retry integration', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('retries the correct number of times on sustained 5xx failure', async () => {
    installDelayStub();
    const maxRetries = 3;
    const mockFetch = makeAlwaysFail(500);
    global.fetch = mockFetch;

    const client = new FetchNetworkClient({ maxRetries, retryBaseDelayMs: 10 });
    await expect(client.execute(makeRequest())).rejects.toThrow();

    // 1 initial attempt + maxRetries retries
    expect(mockFetch).toHaveBeenCalledTimes(maxRetries + 1);
  });

  it('does NOT retry on 4xx client errors', async () => {
    installDelayStub();
    const mockFetch = makeAlwaysFail(404);
    global.fetch = mockFetch;

    const client = new FetchNetworkClient({ maxRetries: 3, retryBaseDelayMs: 10 });
    await expect(client.execute(makeRequest())).rejects.toThrow();

    // Only 1 attempt — 4xx is not retried
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('succeeds when server recovers on Nth attempt', async () => {
    installDelayStub();
    const mockFetch = makeRecoverAfter(2);
    global.fetch = mockFetch;

    const client = new FetchNetworkClient({ maxRetries: 3, retryBaseDelayMs: 10 });
    const response = await client.execute(makeRequest());

    expect(response.statusCode).toBe(200);
    // 2 failures + 1 success
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('enforces the max retry ceiling — stops after maxRetries exhausted', async () => {
    installDelayStub();
    const maxRetries = 2;
    const mockFetch = makeAlwaysFail(503);
    global.fetch = mockFetch;

    const client = new FetchNetworkClient({ maxRetries, retryBaseDelayMs: 10 });
    await expect(client.execute(makeRequest())).rejects.toThrow();

    expect(mockFetch).toHaveBeenCalledTimes(maxRetries + 1);
  });

  it('exponential backoff: delay doubles each retry', async () => {
    const baseDelay = 100;
    const maxRetries = 3;
    const mockFetch = makeAlwaysFail(500);
    global.fetch = mockFetch;

    // Capture retry delays by checking FetchNetworkClient formula indirectly:
    // attempt 1 → base*2^0, attempt 2 → base*2^1, attempt 3 → base*2^2
    const expectedDelays = [
      baseDelay * Math.pow(2, 0),
      baseDelay * Math.pow(2, 1),
      baseDelay * Math.pow(2, 2),
    ];

    // Verify via the observable: stub setTimeout so retries run instantly,
    // capture only delays in the [baseDelay..] range (exclude the per-request
    // abort timeout which is set to timeoutSeconds * 1000 = 30000 ms).
    const capturedDelays: number[] = [];
    jest
      .spyOn(global, 'setTimeout')
      .mockImplementation(
        (fn: Parameters<typeof setTimeout>[0], ms?: number, ...args: unknown[]) => {
          const delay = ms ?? 0;
          if (delay > 0 && delay <= baseDelay * 10) {
            // Only capture retry-range delays
            capturedDelays.push(delay);
          }
          // Execute immediately
          (fn as () => void)(...(args as []));
          return 0 as unknown as ReturnType<typeof setTimeout>;
        },
      );

    const client = new FetchNetworkClient({ maxRetries, retryBaseDelayMs: baseDelay });
    await expect(client.execute(makeRequest())).rejects.toThrow();

    expect(capturedDelays).toEqual(expectedDelays);
  });

  it('zero maxRetries means no retry — only one attempt', async () => {
    installDelayStub();
    const mockFetch = makeAlwaysFail(500);
    global.fetch = mockFetch;

    const client = new FetchNetworkClient({ maxRetries: 0, retryBaseDelayMs: 10 });
    await expect(client.execute(makeRequest())).rejects.toThrow();

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Injectable backoffClock — deterministic backoff tests
// ---------------------------------------------------------------------------

/**
 * Creates a deterministic sleep stub that records every delay requested and
 * resolves immediately — no real timers involved.  This mirrors the injectable-
 * clock pattern used in the Android `OkHttpNetworkClient` tests.
 */
function makeInjectableSleep(): { backoffClock: BackoffClock; delays: number[] } {
  const delays: number[] = [];
  const backoffClock: BackoffClock = (ms: number): Promise<void> => {
    delays.push(ms);
    return Promise.resolve();
  };
  return { backoffClock, delays };
}

describe('FetchNetworkClient — injectable BackoffClock (deterministic backoff)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('injectable BackoffClock is called once per retry with correct delays', async () => {
    const { backoffClock, delays } = makeInjectableSleep();
    const baseDelay = 100;
    const maxRetries = 3;
    const mockFetch = makeAlwaysFail(500);
    global.fetch = mockFetch;

    const client = new FetchNetworkClient({
      maxRetries,
      retryBaseDelayMs: baseDelay,
      backoffClock,
    });
    await expect(client.execute(makeRequest())).rejects.toThrow();

    // backoffClock called once per retry (not for the initial attempt)
    expect(delays).toHaveLength(maxRetries);
    expect(delays).toEqual([
      baseDelay * Math.pow(2, 0), // 100
      baseDelay * Math.pow(2, 1), // 200
      baseDelay * Math.pow(2, 2), // 400
    ]);
  });

  it('injectable BackoffClock is NOT called on first attempt (no prior failure)', async () => {
    const { backoffClock, delays } = makeInjectableSleep();
    global.fetch = jest.fn().mockResolvedValueOnce({
      status: 200,
      arrayBuffer: async (): Promise<ArrayBuffer> => new Uint8Array().buffer,
      headers: { forEach: (): void => {} },
    } as unknown as Response);

    const client = new FetchNetworkClient({ maxRetries: 3, retryBaseDelayMs: 100, backoffClock });
    await client.execute(makeRequest());

    expect(delays).toHaveLength(0);
  });

  it('injectable BackoffClock is NOT called for 4xx errors (no retry)', async () => {
    const { backoffClock, delays } = makeInjectableSleep();
    global.fetch = makeAlwaysFail(403);

    const client = new FetchNetworkClient({ maxRetries: 3, retryBaseDelayMs: 100, backoffClock });
    await expect(client.execute(makeRequest())).rejects.toThrow();

    expect(delays).toHaveLength(0);
  });

  it('injectable BackoffClock records partial delays when server recovers mid-retry', async () => {
    const { backoffClock, delays } = makeInjectableSleep();
    const baseDelay = 50;
    global.fetch = makeRecoverAfter(2);

    const client = new FetchNetworkClient({
      maxRetries: 3,
      retryBaseDelayMs: baseDelay,
      backoffClock,
    });
    const response = await client.execute(makeRequest());

    expect(response.statusCode).toBe(200);
    // 2 failures → 2 sleeps
    expect(delays).toHaveLength(2);
    expect(delays).toEqual([baseDelay * Math.pow(2, 0), baseDelay * Math.pow(2, 1)]);
  });

  it('default BackoffClock (no injection) still works — setTimeout is used for retry delay', async () => {
    // Stub setTimeout so the test runs fast; filter for retry-range delays only.
    const baseDelay = 10;
    const capturedDelays: number[] = [];
    jest
      .spyOn(global, 'setTimeout')
      .mockImplementation(
        (fn: Parameters<typeof setTimeout>[0], ms?: number, ...args: unknown[]) => {
          const d = ms ?? 0;
          // Capture only the retry-range delay (not the per-request abort timeout)
          if (d > 0 && d <= baseDelay * 10) capturedDelays.push(d);
          (fn as () => void)(...(args as []));
          return 0 as unknown as ReturnType<typeof setTimeout>;
        },
      );

    const mockFetch = makeAlwaysFail(500);
    global.fetch = mockFetch;

    // No backoffClock injected — uses default setTimeout-backed delay
    const client = new FetchNetworkClient({ maxRetries: 1, retryBaseDelayMs: baseDelay });
    await expect(client.execute(makeRequest())).rejects.toThrow();

    // 1 retry → 1 delay recorded in the retry-range
    expect(capturedDelays).toHaveLength(1);
    expect(capturedDelays[0]).toBe(baseDelay);
  });
});
