/**
 * Defines the contract for recording analytics events.
 */
export interface AnalyticsProvider {
  /** Records an event with the given `name` and optional `properties`. */
  track(name: string, properties?: Record<string, string>): void;
}

/**
 * An {@link AnalyticsProvider} that logs events to the console.
 */
export class ConsoleAnalyticsProvider implements AnalyticsProvider {
  track(name: string, properties: Record<string, string> = {}): void {
    // eslint-disable-next-line no-console
    console.log('[Analytics]', name, properties);
  }
}
