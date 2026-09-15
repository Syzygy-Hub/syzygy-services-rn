import type {
  LoggerProtocol,
  NetworkClientProtocol,
  NetworkRequest,
  NetworkResponse,
} from 'syzygy-foundation-rn';
import { SyzygyErrorCode, SyzygyErrorSeverity } from 'syzygy-foundation-rn';

// ---------------------------------------------------------------------------
// NetworkError — local SyzygyError implementation
// ---------------------------------------------------------------------------

/**
 * A concrete {@link Error} that carries a {@link SyzygyErrorCode} and severity.
 * Used by {@link FetchNetworkClient} to surface HTTP/network failures.
 */
export class NetworkError extends Error {
  /** @inheritdoc */
  readonly code: SyzygyErrorCode;
  /** @inheritdoc */
  readonly severity: SyzygyErrorSeverity;
  /** @inheritdoc */
  readonly underlyingError?: Error;

  constructor(
    message: string,
    code: SyzygyErrorCode,
    severity: SyzygyErrorSeverity = SyzygyErrorSeverity.Error,
    underlyingError?: Error,
  ) {
    super(message);
    this.name = 'NetworkError';
    this.code = code;
    this.severity = severity;
    this.underlyingError = underlyingError;
  }
}

// ---------------------------------------------------------------------------
// RequestInterceptor
// ---------------------------------------------------------------------------

/**
 * Intercepts a {@link NetworkRequest} before it is executed.
 * Implementations may add headers, sign requests, or log outgoing calls.
 */
export interface RequestInterceptor {
  /**
   * Called before the request is dispatched.
   * Return the (potentially modified) request that should be sent.
   */
  intercept(request: NetworkRequest): NetworkRequest | Promise<NetworkRequest>;
}

// ---------------------------------------------------------------------------
// FetchNetworkClient
// ---------------------------------------------------------------------------

/**
 * Injectable backoff clock for retry back-off.
 *
 * The default implementation uses `setTimeout`; in tests, pass a deterministic
 * stub that records delays and resolves immediately — mirroring the
 * injectable-clock pattern used in the Android `OkHttpNetworkClient`.
 *
 * @param ms  Milliseconds to sleep.
 */
export type BackoffClock = (ms: number) => Promise<void>;

/** Configuration options for {@link FetchNetworkClient}. */
export interface FetchNetworkClientOptions {
  /** Maximum number of automatic retries on server errors (5xx). Default: 3. */
  maxRetries?: number;
  /** Base delay (ms) for exponential back-off. Default: 200. */
  retryBaseDelayMs?: number;
  /** Interceptors applied to every request before dispatch. */
  interceptors?: RequestInterceptor[];
  /**
   * Backoff clock used between retry attempts.  Defaults to a `setTimeout`-
   * backed promise; inject a deterministic stub in tests to eliminate real
   * timer waits and assert exact back-off values.
   */
  backoffClock?: BackoffClock;
  /**
   * Optional logger.  When provided, every request, response and error is
   * logged via the supplied {@link LoggerProtocol}.  When `undefined` (the
   * default), the logging path is never entered — zero overhead.
   */
  logger?: LoggerProtocol;
}

/**
 * Fetch-based implementation of {@link NetworkClientProtocol}.
 *
 * Features:
 * - Supports GET, POST, PUT, DELETE, PATCH (driven by {@link NetworkRequest.method})
 * - Per-request timeout via {@link AbortController}
 * - Automatic retry with exponential back-off for 5xx responses (up to `maxRetries`)
 * - Request interceptor pipeline
 * - Maps network/HTTP failures to {@link NetworkError}
 */
export class FetchNetworkClient implements NetworkClientProtocol {
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly interceptors: RequestInterceptor[];
  private readonly backoffClock: BackoffClock;
  private readonly logger?: LoggerProtocol;
  private _disposed = false;

  constructor(options: FetchNetworkClientOptions = {}) {
    this.maxRetries = options.maxRetries ?? 3;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 200;
    this.interceptors = options.interceptors ?? [];
    this.backoffClock = options.backoffClock ?? defaultBackoffClock;
    this.logger = options.logger;
  }

  /**
   * Releases this client.  After `dispose()` is called:
   * - No further requests are accepted; `execute()` will throw a
   *   {@link NetworkError} with code {@link SyzygyErrorCode.unknown}.
   * - Calling `dispose()` more than once is a safe no-op.
   */
  dispose(): void {
    this._disposed = true;
  }

  /**
   * Executes a {@link NetworkRequest} and returns the {@link NetworkResponse}.
   *
   * Retries are performed only on 5xx server errors (not 4xx client errors or timeouts).
   * Each retry waits `retryBaseDelayMs * 2^attempt` milliseconds.
   *
   * @throws {@link NetworkError} on timeout, network failure, or unrecoverable HTTP error.
   * @throws {@link NetworkError} (unknown) if the client has been disposed.
   */
  async execute(request: NetworkRequest): Promise<NetworkResponse> {
    if (this._disposed) {
      throw new NetworkError(
        'NetworkClient has been disposed',
        SyzygyErrorCode.unknown,
        SyzygyErrorSeverity.Error,
      );
    }
    let intercepted = request;
    for (const interceptor of this.interceptors) {
      intercepted = await interceptor.intercept(intercepted);
    }

    if (this.logger) {
      const safeHeaders = Object.fromEntries(
        Object.entries(intercepted.headers).filter(([k]) => k.toLowerCase() !== 'authorization'),
      );
      this.logger.debug(`[NetworkClient] --> ${intercepted.method} ${intercepted.url}`, {
        method: intercepted.method,
        url: intercepted.url,
        headerKeys: Object.keys(safeHeaders).join(','),
        bodySize: String(intercepted.body ? intercepted.body.byteLength : 0),
      });
    }

    const startTime = Date.now();
    let lastError: NetworkError | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        await this.backoffClock(this.retryBaseDelayMs * Math.pow(2, attempt - 1));
      }
      try {
        const response = await this._executeOnce(intercepted);
        if (this.logger) {
          const elapsed = Date.now() - startTime;
          this.logger.debug(`[NetworkClient] <-- ${response.statusCode}`, {
            statusCode: String(response.statusCode),
            elapsedMs: String(elapsed),
            bodySize: String(response.data.byteLength),
          });
        }
        return response;
      } catch (err) {
        const netErr = err as NetworkError;
        // Retry only on server errors; propagate others immediately
        if (netErr.code?.rawValue === SyzygyErrorCode.serverError.rawValue) {
          lastError = netErr;
          continue;
        }
        if (this.logger) {
          const elapsed = Date.now() - startTime;
          this.logger.error(
            `[NetworkClient] ERROR ${intercepted.method} ${intercepted.url}`,
            netErr,
            { elapsedMs: String(elapsed) },
          );
        }
        throw err;
      }
    }

    if (this.logger && lastError) {
      const elapsed = Date.now() - startTime;
      this.logger.error(
        `[NetworkClient] FAILED ${intercepted.method} ${intercepted.url}`,
        lastError,
        { elapsedMs: String(elapsed) },
      );
    }
    throw lastError!;
  }

  private async _executeOnce(request: NetworkRequest): Promise<NetworkResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutSeconds * 1000);

    let rawResponse: Response;
    try {
      rawResponse = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const error = err as Error;
      if (error.name === 'AbortError') {
        throw new NetworkError(
          `Request timed out after ${request.timeoutSeconds}s`,
          SyzygyErrorCode.timeout,
          SyzygyErrorSeverity.Error,
          error,
        );
      }
      throw new NetworkError(
        `Network request failed: ${error.message}`,
        SyzygyErrorCode.networkUnavailable,
        SyzygyErrorSeverity.Error,
        error,
      );
    } finally {
      clearTimeout(timer);
    }

    const arrayBuffer = await rawResponse.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    const headers: Record<string, string> = {};
    rawResponse.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const statusCode = rawResponse.status;
    const response = buildResponse(statusCode, data, headers);

    if (response.isServerError) {
      throw new NetworkError(
        `Server error: ${statusCode}`,
        SyzygyErrorCode.serverError,
        SyzygyErrorSeverity.Error,
      );
    }

    if (statusCode === 401) {
      throw new NetworkError(
        'Unauthenticated',
        SyzygyErrorCode.unauthenticated,
        SyzygyErrorSeverity.Error,
      );
    }
    if (statusCode === 403) {
      throw new NetworkError('Forbidden', SyzygyErrorCode.forbidden, SyzygyErrorSeverity.Error);
    }
    if (statusCode === 404) {
      throw new NetworkError('Not found', SyzygyErrorCode.notFound, SyzygyErrorSeverity.Error);
    }

    return response;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildResponse(
  statusCode: number,
  data: Uint8Array,
  headers: Record<string, string>,
): NetworkResponse {
  return {
    statusCode,
    data,
    headers,
    get isSuccess(): boolean {
      return statusCode >= 200 && statusCode <= 299;
    },
    get isClientError(): boolean {
      return statusCode >= 400 && statusCode <= 499;
    },
    get isServerError(): boolean {
      return statusCode >= 500 && statusCode <= 599;
    },
  };
}

function defaultBackoffClock(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
