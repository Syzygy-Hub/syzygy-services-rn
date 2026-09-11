/**
 * Defines the contract for crash and non-fatal error reporting.
 */
export interface CrashReporter {
  /** Reports a fatal crash with the given `message` and optional `metadata`. */
  reportCrash(message: string, metadata?: Record<string, string>): void;
  /** Records a non-fatal `error` with optional `metadata`. */
  recordError(error: Error, metadata?: Record<string, string>): void;
}

/**
 * A {@link CrashReporter} that logs crash and error events to the console.
 */
export class ConsoleCrashReporter implements CrashReporter {
  reportCrash(message: string, metadata: Record<string, string> = {}): void {
    // eslint-disable-next-line no-console
    console.error('[CrashReporter] CRASH:', message, metadata);
  }

  recordError(error: Error, metadata: Record<string, string> = {}): void {
    // eslint-disable-next-line no-console
    console.error('[CrashReporter] ERROR:', error.message, metadata);
  }
}
