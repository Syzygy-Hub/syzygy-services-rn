import { ConsoleAnalyticsProvider } from '../../analytics/AnalyticsProvider';

describe('AnalyticsProvider', () => {
  it('ConsoleAnalyticsProvider tracks event without throwing', () => {
    const provider = new ConsoleAnalyticsProvider();
    expect(() => provider.track('test_event', { key: 'value' })).not.toThrow();
  });
});
