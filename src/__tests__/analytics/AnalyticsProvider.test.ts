import { createAnalyticsEvent } from 'syzygy-foundation-rn';

import {
  ConsoleAnalyticsProvider,
  InMemoryAnalyticsProvider,
} from '../../analytics/AnalyticsProvider';

// ---------------------------------------------------------------------------
// InMemoryAnalyticsProvider
// ---------------------------------------------------------------------------

describe('InMemoryAnalyticsProvider', () => {
  it('track stores the event', () => {
    const provider = new InMemoryAnalyticsProvider();
    const event = createAnalyticsEvent('button_click', { label: 'submit' });
    provider.track(event);
    expect(provider.events).toHaveLength(1);
    expect(provider.events[0].name).toBe('button_click');
    expect(provider.events[0].properties.label).toBe('submit');
  });

  it('identify stores user properties', () => {
    const provider = new InMemoryAnalyticsProvider();
    provider.identify('user-1', { plan: 'pro' });
    expect(provider.userProperties.userId).toBe('user-1');
    expect(provider.userProperties.plan).toBe('pro');
  });

  it('setUserProperties merges into existing properties', () => {
    const provider = new InMemoryAnalyticsProvider();
    provider.setUserProperties({ a: 1 });
    provider.setUserProperties({ b: 2 });
    expect(provider.userProperties.a).toBe(1);
    expect(provider.userProperties.b).toBe(2);
  });

  it('trackScreen records the screen name and adds a screen_view event', () => {
    const provider = new InMemoryAnalyticsProvider();
    provider.trackScreen('HomeScreen', { tab: 'feed' });
    expect(provider.screenViews).toEqual(['HomeScreen']);
    expect(provider.events[0].name).toBe('screen_view');
    expect(provider.events[0].properties.screenName).toBe('HomeScreen');
  });

  it('sessionId is a non-empty string', () => {
    const provider = new InMemoryAnalyticsProvider();
    expect(provider.sessionId.length).toBeGreaterThan(0);
  });

  it('reset clears user properties and generates a new sessionId', () => {
    const provider = new InMemoryAnalyticsProvider();
    provider.identify('user-1', { plan: 'free' });
    const oldSession = provider.sessionId;
    provider.reset();
    expect(provider.userProperties).toEqual({});
    expect(provider.sessionId).not.toBe(oldSession);
  });

  it('sessionId is present in every tracked event', () => {
    const provider = new InMemoryAnalyticsProvider();
    const event = createAnalyticsEvent('button_click', { label: 'ok' });
    provider.track(event);
    expect(provider.events[0].properties.sessionId).toBe(provider.sessionId);
  });

  it('sessionId in events changes after reset()', () => {
    const provider = new InMemoryAnalyticsProvider();
    provider.track(createAnalyticsEvent('before_reset'));
    const idBefore = provider.events[0].properties.sessionId as string;
    provider.reset();
    provider.track(createAnalyticsEvent('after_reset'));
    const idAfter = provider.events[1].properties.sessionId as string;
    expect(idBefore).toBeTruthy();
    expect(idAfter).toBeTruthy();
    expect(idAfter).not.toBe(idBefore);
  });
});

// ---------------------------------------------------------------------------
// ConsoleAnalyticsProvider
// ---------------------------------------------------------------------------

describe('ConsoleAnalyticsProvider', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('track emits to console.log with sessionId in properties', () => {
    const provider = new ConsoleAnalyticsProvider();
    const event = createAnalyticsEvent('page_view');
    provider.track(event);
    expect(consoleSpy).toHaveBeenCalledWith(
      '[Analytics] track',
      'page_view',
      expect.objectContaining({ sessionId: provider.sessionId }),
      expect.anything(),
    );
  });

  it('trackScreen emits a screen_view event', () => {
    const provider = new ConsoleAnalyticsProvider();
    provider.trackScreen('SettingsScreen');
    expect(consoleSpy).toHaveBeenCalledWith(
      '[Analytics] track',
      'screen_view',
      expect.objectContaining({ screenName: 'SettingsScreen' }),
      expect.anything(),
    );
  });

  it('identify logs user and updates userProperties', () => {
    const provider = new ConsoleAnalyticsProvider();
    provider.identify('u2', { email: 'a@b.com' });
    expect(provider.userProperties.userId).toBe('u2');
    expect(consoleSpy).toHaveBeenCalledWith('[Analytics] identify', 'u2', { email: 'a@b.com' });
  });

  it('reset generates a new sessionId', () => {
    const provider = new ConsoleAnalyticsProvider();
    const s1 = provider.sessionId;
    provider.reset();
    expect(provider.sessionId).not.toBe(s1);
  });
});
