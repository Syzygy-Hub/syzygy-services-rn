/**
 * User context attached to crash reports.
 */
export interface CrashUserContext {
  /** Unique identifier for the user. */
  readonly userId?: string;
  /** User's email address. */
  readonly email?: string;
}

/**
 * Contract for crash and non-fatal error reporting.
 */
export interface CrashReporter {
  /**
   * Reports a fatal crash.  Implementations should flush the report
   * synchronously (or as close to synchronously as possible) before the
   * process exits.
   *
   * @param message   Human-readable description of the crash.
   * @param metadata  Arbitrary key-value pairs attached to the report.
   */
  reportCrash(message: string, metadata?: Record<string, string>): void;

  /**
   * Records a non-fatal error without terminating the application.
   *
   * @param error     The caught {@link Error} object.
   * @param metadata  Arbitrary key-value pairs attached to the report.
   */
  recordError(error: Error, metadata?: Record<string, string>): void;

  /**
   * Associates a user identity with subsequent reports.
   * Pass `undefined` to clear the current context.
   */
  setUserContext(context: CrashUserContext | undefined): void;

  /**
   * Attaches an arbitrary key-value pair that is included in all subsequent
   * crash and error reports.
   */
  setMetadata(key: string, value: string): void;
}

// ---------------------------------------------------------------------------
// ConsoleCrashReporter
// ---------------------------------------------------------------------------

/**
 * {@link CrashReporter} that writes all reports to `console.error`.
 *
 * Suitable for development and testing.  Replace with a real SDK
 * (Sentry, Bugsnag, Firebase Crashlytics, …) for production.
 */
export class ConsoleCrashReporter implements CrashReporter {
  private _userContext: CrashUserContext | undefined;
  private readonly _metadata: Record<string, string> = {};

  /**
   * Logs a fatal crash to `console.error`.  Does not throw or terminate the
   * process (stub behaviour).
   */
  reportCrash(message: string, metadata: Record<string, string> = {}): void {
    // eslint-disable-next-line no-console
    console.error(
      '[CrashReporter] CRASH:',
      message,
      { ...this._metadata, ...metadata },
      this._userContext,
    );
  }

  /**
   * Logs a non-fatal error to `console.error`.
   */
  recordError(error: Error, metadata: Record<string, string> = {}): void {
    // eslint-disable-next-line no-console
    console.error(
      '[CrashReporter] ERROR:',
      error.message,
      { ...this._metadata, ...metadata },
      this._userContext,
    );
  }

  /**
   * Stores `context` so it is included in subsequent reports.
   * Pass `undefined` to clear.
   */
  setUserContext(context: CrashUserContext | undefined): void {
    this._userContext = context;
  }

  /**
   * Adds or updates a metadata key.
   */
  setMetadata(key: string, value: string): void {
    this._metadata[key] = value;
  }

  /** Returns a copy of the current metadata map (useful in tests). */
  get metadata(): Record<string, string> {
    return { ...this._metadata };
  }

  /** Returns the current user context (useful in tests). */
  get userContext(): CrashUserContext | undefined {
    return this._userContext;
  }
}

// ---------------------------------------------------------------------------
// InMemoryCrashReporter (testing)
// ---------------------------------------------------------------------------

/** A recorded crash event. */
export interface CrashRecord {
  readonly kind: 'crash';
  readonly message: string;
  readonly metadata: Record<string, string>;
}

/** A recorded non-fatal error event. */
export interface ErrorRecord {
  readonly kind: 'error';
  readonly error: Error;
  readonly metadata: Record<string, string>;
}

/**
 * In-memory {@link CrashReporter} that accumulates reports for inspection in
 * unit tests rather than writing to the console.
 */
export class InMemoryCrashReporter implements CrashReporter {
  /** All crash records in insertion order. */
  readonly crashes: CrashRecord[] = [];
  /** All non-fatal error records in insertion order. */
  readonly errors: ErrorRecord[] = [];

  private _userContext: CrashUserContext | undefined;
  private readonly _metadata: Record<string, string> = {};

  reportCrash(message: string, metadata: Record<string, string> = {}): void {
    this.crashes.push({ kind: 'crash', message, metadata: { ...this._metadata, ...metadata } });
  }

  recordError(error: Error, metadata: Record<string, string> = {}): void {
    this.errors.push({ kind: 'error', error, metadata: { ...this._metadata, ...metadata } });
  }

  setUserContext(context: CrashUserContext | undefined): void {
    this._userContext = context;
  }

  setMetadata(key: string, value: string): void {
    this._metadata[key] = value;
  }

  get userContext(): CrashUserContext | undefined {
    return this._userContext;
  }

  get metadata(): Record<string, string> {
    return { ...this._metadata };
  }
}
