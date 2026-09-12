import { createAnalyticsEvent } from 'syzygy-foundation-rn';
import type { AnalyticsEvent, AnalyticsProvider } from 'syzygy-foundation-rn';

// ---------------------------------------------------------------------------
// Extended AnalyticsProvider
// ---------------------------------------------------------------------------

/**
 * Extended analytics contract that adds screen-view tracking, user-property
 * management, and session management on top of the Foundation
 * {@link AnalyticsProvider}.
 */
export interface ExtendedAnalyticsProvider extends AnalyticsProvider {
  /**
   * Records a screen-view event.
   * @param screenName  Name of the screen or route.
   * @param properties  Additional metadata attached to the event.
   */
  trackScreen(screenName: string, properties?: Record<string, unknown>): void;

  /**
   * Persists arbitrary key-value pairs against the current user profile.
   * Properties are merged into (not replaced) the existing set.
   */
  setUserProperties(properties: Record<string, unknown>): void;

  /**
   * Returns a copy of the current user properties map.
   */
  readonly userProperties: Record<string, unknown>;

  /**
   * The current session identifier (UUID).  A new session ID is generated
   * when {@link reset} is called or when a new provider instance is created.
   */
  readonly sessionId: string;
}

// ---------------------------------------------------------------------------
// UUID helper (no third-party deps)
// ---------------------------------------------------------------------------

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------------------------------------------------------------------------
// ConsoleAnalyticsProvider
// ---------------------------------------------------------------------------

/**
 * Analytics provider that emits all events to `console.log`.
 *
 * Suitable for development builds.  In production, replace with a provider
 * that forwards events to your analytics platform (Amplitude, Mixpanel, …).
 */
export class ConsoleAnalyticsProvider implements ExtendedAnalyticsProvider {
  private _userProperties: Record<string, unknown> = {};
  private _sessionId: string = generateUUID();

  /**
   * Tracks a Foundation {@link AnalyticsEvent}.
   */
  track(event: AnalyticsEvent): void {
    // eslint-disable-next-line no-console
    console.log('[Analytics] track', event.name, event.properties, event.timestamp);
  }

  /**
   * Associates a user identity with subsequent events.
   */
  identify(userId: string, traits: Record<string, unknown>): void {
    this._userProperties = { ...this._userProperties, userId, ...traits };
    // eslint-disable-next-line no-console
    console.log('[Analytics] identify', userId, traits);
  }

  /**
   * Clears the current identity and starts a new session.
   */
  reset(): void {
    this._userProperties = {};
    this._sessionId = generateUUID();
    // eslint-disable-next-line no-console
    console.log('[Analytics] reset');
  }

  /**
   * Records a screen-view event using the `screen_view` event name.
   */
  trackScreen(screenName: string, properties: Record<string, unknown> = {}): void {
    const event = createAnalyticsEvent('screen_view', { screenName, ...properties });
    this.track(event);
  }

  /**
   * Merges `properties` into the stored user properties.
   */
  setUserProperties(properties: Record<string, unknown>): void {
    this._userProperties = { ...this._userProperties, ...properties };
  }

  /** A shallow copy of the current user properties. */
  get userProperties(): Record<string, unknown> {
    return { ...this._userProperties };
  }

  /** UUID identifying the current analytics session. */
  get sessionId(): string {
    return this._sessionId;
  }
}

// ---------------------------------------------------------------------------
// InMemoryAnalyticsProvider (testing)
// ---------------------------------------------------------------------------

/**
 * An in-memory analytics provider that records all events and calls to an
 * internal log.  Ideal for unit tests — inspect `.events` and
 * `.screenViews` rather than spying on `console.log`.
 */
export class InMemoryAnalyticsProvider implements ExtendedAnalyticsProvider {
  /** All {@link AnalyticsEvent} objects passed to {@link track}. */
  readonly events: AnalyticsEvent[] = [];
  /** Screen names passed to {@link trackScreen}. */
  readonly screenViews: string[] = [];

  private _userProperties: Record<string, unknown> = {};
  private _sessionId: string = generateUUID();

  track(event: AnalyticsEvent): void {
    this.events.push(event);
  }

  identify(userId: string, traits: Record<string, unknown>): void {
    this._userProperties = { ...this._userProperties, userId, ...traits };
  }

  reset(): void {
    this._userProperties = {};
    this._sessionId = generateUUID();
  }

  trackScreen(screenName: string, properties: Record<string, unknown> = {}): void {
    this.screenViews.push(screenName);
    const event = createAnalyticsEvent('screen_view', { screenName, ...properties });
    this.events.push(event);
  }

  setUserProperties(properties: Record<string, unknown>): void {
    this._userProperties = { ...this._userProperties, ...properties };
  }

  get userProperties(): Record<string, unknown> {
    return { ...this._userProperties };
  }

  get sessionId(): string {
    return this._sessionId;
  }
}
