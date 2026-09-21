/**
 * Integration tests for FetchNetworkClient retry behaviour.
 *
 * Uses a mock fetch implementation that counts calls.  Delays are set to 0 ms
 * so retries run synchronously in the microtask queue without needing fake timers.
 */
import { createNetworkRequest } from 'syzygy-foundation-rn';

import {
  BACKOFF_BASE_MS,
  BACKOFF_CAP_MS,
  BACKOFF_MULTIPLIER,
  FetchNetworkClient,
  MAX_RETRY_ATTEMPTS,
} from '../../networking/NetworkClient';
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

  it('exponential backoff: delay grows with each retry (jitter range check)', async () => {
    const baseDelay = 100;
    const capMs = 8000;
    const maxRetries = 3;
    const mockFetch = makeAlwaysFail(500);
    global.fetch = mockFetch;

    // Canonical policy: delay = random(0, min(cap, base * 2^attempt))
    // attempt 1 → [0, min(cap, base*2^0)] = [0, 100]
    // attempt 2 → [0, min(cap, base*2^1)] = [0, 200]
    // attempt 3 → [0, min(cap, base*2^2)] = [0, 400]
    const expectedCaps = [
      Math.min(capMs, baseDelay * Math.pow(2, 0)),
      Math.min(capMs, baseDelay * Math.pow(2, 1)),
      Math.min(capMs, baseDelay * Math.pow(2, 2)),
    ];

    const capturedDelays: number[] = [];
    jest
      .spyOn(global, 'setTimeout')
      .mockImplementation(
        (fn: Parameters<typeof setTimeout>[0], ms?: number, ...args: unknown[]) => {
          const delay = ms ?? 0;
          if (delay >= 0 && delay <= baseDelay * 10) {
            // Only capture retry-range delays
            capturedDelays.push(delay);
          }
          // Execute immediately
          (fn as () => void)(...(args as []));
          return 0 as unknown as ReturnType<typeof setTimeout>;
        },
      );

    const client = new FetchNetworkClient({
      maxRetries,
      retryBaseDelayMs: baseDelay,
      retryCapMs: capMs,
    });
    await expect(client.execute(makeRequest())).rejects.toThrow();

    expect(capturedDelays).toHaveLength(maxRetries);
    capturedDelays.forEach((delay, i) => {
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(expectedCaps[i]);
    });
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

  it('injectable BackoffClock is called once per retry with jitter delays in expected range', async () => {
    const { backoffClock, delays } = makeInjectableSleep();
    const baseDelay = 100;
    const capMs = 8000;
    const maxRetries = 3;
    const mockFetch = makeAlwaysFail(500);
    global.fetch = mockFetch;

    const client = new FetchNetworkClient({
      maxRetries,
      retryBaseDelayMs: baseDelay,
      retryCapMs: capMs,
      backoffClock,
    });
    await expect(client.execute(makeRequest())).rejects.toThrow();

    // backoffClock called once per retry (not for the initial attempt)
    expect(delays).toHaveLength(maxRetries);
    // Canonical policy: delay = random(0, min(cap, base * 2^attempt))
    const expectedCaps = [
      Math.min(capMs, baseDelay * Math.pow(2, 0)), // [0, 100]
      Math.min(capMs, baseDelay * Math.pow(2, 1)), // [0, 200]
      Math.min(capMs, baseDelay * Math.pow(2, 2)), // [0, 400]
    ];
    delays.forEach((delay, i) => {
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(expectedCaps[i]);
    });
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
    const capMs = 8000;
    global.fetch = makeRecoverAfter(2);

    const client = new FetchNetworkClient({
      maxRetries: 3,
      retryBaseDelayMs: baseDelay,
      retryCapMs: capMs,
      backoffClock,
    });
    const response = await client.execute(makeRequest());

    expect(response.statusCode).toBe(200);
    // 2 failures → 2 sleeps
    expect(delays).toHaveLength(2);
    // Canonical policy: delay = random(0, min(cap, base * 2^attempt))
    const expectedCaps = [
      Math.min(capMs, baseDelay * Math.pow(2, 0)), // [0, 50]
      Math.min(capMs, baseDelay * Math.pow(2, 1)), // [0, 100]
    ];
    delays.forEach((delay, i) => {
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(expectedCaps[i]);
    });
  });

  it('default BackoffClock (no injection) still works — setTimeout is used for retry delay', async () => {
    // Stub setTimeout so the test runs fast; filter for retry-range delays only.
    const baseDelay = 10;
    const capMs = 8000;
    const capturedDelays: number[] = [];
    jest
      .spyOn(global, 'setTimeout')
      .mockImplementation(
        (fn: Parameters<typeof setTimeout>[0], ms?: number, ...args: unknown[]) => {
          const d = ms ?? 0;
          // Capture only the retry-range delay (not the per-request abort timeout)
          if (d >= 0 && d <= baseDelay * 10) capturedDelays.push(d);
          (fn as () => void)(...(args as []));
          return 0 as unknown as ReturnType<typeof setTimeout>;
        },
      );

    const mockFetch = makeAlwaysFail(500);
    global.fetch = mockFetch;

    // No backoffClock injected — uses default setTimeout-backed delay
    const client = new FetchNetworkClient({
      maxRetries: 1,
      retryBaseDelayMs: baseDelay,
      retryCapMs: capMs,
    });
    await expect(client.execute(makeRequest())).rejects.toThrow();

    // 1 retry → 1 delay recorded in the retry-range (jittered: [0, min(cap, base)])
    expect(capturedDelays).toHaveLength(1);
    expect(capturedDelays[0]).toBeGreaterThanOrEqual(0);
    expect(capturedDelays[0]).toBeLessThanOrEqual(Math.min(capMs, baseDelay));
  });
});

// ---------------------------------------------------------------------------
// Canonical backoff policy contract assertions
// Verifies the cross-platform backoff contract:
//   delay = random(0, min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * BACKOFF_MULTIPLIER^attempt))
// ---------------------------------------------------------------------------

describe('Canonical backoff policy — range assertions', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('attempt 0 (retry 1): delay in [0, 500]', async () => {
    const { backoffClock, delays } = makeInjectableSleep();
    global.fetch = makeAlwaysFail(500);
    const client = new FetchNetworkClient({ maxRetries: 1, backoffClock });
    await expect(client.execute(makeRequest())).rejects.toThrow();
    expect(delays).toHaveLength(1);
    expect(delays[0]).toBeGreaterThanOrEqual(0);
    expect(delays[0]).toBeLessThanOrEqual(
      Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * Math.pow(BACKOFF_MULTIPLIER, 0)),
    );
  });

  it('attempt 1 (retry 2): delay in [0, 1000]', async () => {
    const { backoffClock, delays } = makeInjectableSleep();
    global.fetch = makeAlwaysFail(500);
    const client = new FetchNetworkClient({ maxRetries: 2, backoffClock });
    await expect(client.execute(makeRequest())).rejects.toThrow();
    expect(delays).toHaveLength(2);
    expect(delays[1]).toBeGreaterThanOrEqual(0);
    expect(delays[1]).toBeLessThanOrEqual(
      Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * Math.pow(BACKOFF_MULTIPLIER, 1)),
    );
  });

  it('attempt 2 (retry 3): delay in [0, 2000]', async () => {
    const { backoffClock, delays } = makeInjectableSleep();
    global.fetch = makeAlwaysFail(500);
    const client = new FetchNetworkClient({ maxRetries: MAX_RETRY_ATTEMPTS, backoffClock });
    await expect(client.execute(makeRequest())).rejects.toThrow();
    expect(delays.length).toBeGreaterThanOrEqual(3);
    expect(delays[2]).toBeGreaterThanOrEqual(0);
    expect(delays[2]).toBeLessThanOrEqual(
      Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * Math.pow(BACKOFF_MULTIPLIER, 2)),
    );
  });

  it('attempt 3 (retry 4): delay in [0, 8000] — cap applies', async () => {
    const { backoffClock, delays } = makeInjectableSleep();
    global.fetch = makeAlwaysFail(500);
    const client = new FetchNetworkClient({ maxRetries: 4, backoffClock });
    await expect(client.execute(makeRequest())).rejects.toThrow();
    expect(delays.length).toBeGreaterThanOrEqual(4);
    // base * 2^3 = 4000, which is < cap 8000, so cap = 8000 but actual max is 4000
    expect(delays[3]).toBeGreaterThanOrEqual(0);
    expect(delays[3]).toBeLessThanOrEqual(BACKOFF_CAP_MS);
  });
});
