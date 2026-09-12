import { InMemoryPushProvider } from '../../pushnotifications/PushProvider';
import type { NotificationPayload } from '../../pushnotifications/PushProvider';

const SAMPLE_PAYLOAD: NotificationPayload = {
  title: 'Hello',
  body: 'World',
  data: { key: 'value' },
};

describe('InMemoryPushProvider', () => {
  it('deviceToken is null before registration', () => {
    const provider = new InMemoryPushProvider();
    expect(provider.deviceToken).toBeNull();
  });

  it('requestPermission resolves to true', async () => {
    const provider = new InMemoryPushProvider();
    await expect(provider.requestPermission()).resolves.toBe(true);
  });

  it('registerToken stores the token', () => {
    const provider = new InMemoryPushProvider();
    provider.registerToken('token-123');
    expect(provider.deviceToken).toBe('token-123');
  });

  it('unregisterToken clears the token', () => {
    const provider = new InMemoryPushProvider();
    provider.registerToken('tok');
    provider.unregisterToken();
    expect(provider.deviceToken).toBeNull();
  });

  it('onNotification handler is called when simulateNotification is invoked', () => {
    const provider = new InMemoryPushProvider();
    const received: NotificationPayload[] = [];
    provider.onNotification((p) => received.push(p));
    provider.simulateNotification(SAMPLE_PAYLOAD);
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(SAMPLE_PAYLOAD);
  });

  it('multiple handlers all receive the notification', () => {
    const provider = new InMemoryPushProvider();
    const log1: string[] = [];
    const log2: string[] = [];
    provider.onNotification((p) => log1.push(p.title));
    provider.onNotification((p) => log2.push(p.title));
    provider.simulateNotification(SAMPLE_PAYLOAD);
    expect(log1).toEqual(['Hello']);
    expect(log2).toEqual(['Hello']);
  });

  it('unsubscribe stops the handler from being called', () => {
    const provider = new InMemoryPushProvider();
    const received: NotificationPayload[] = [];
    const unsub = provider.onNotification((p) => received.push(p));
    unsub();
    provider.simulateNotification(SAMPLE_PAYLOAD);
    expect(received).toHaveLength(0);
  });
});
