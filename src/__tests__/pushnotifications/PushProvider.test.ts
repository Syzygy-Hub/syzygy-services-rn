import {
  InMemoryPushProvider,
  createNotificationPayload,
  createAlertNotification,
  createMessageNotification,
  createSilentNotification,
} from '../../pushnotifications/PushProvider';
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

// ---------------------------------------------------------------------------
// NotificationPayload factory helpers
// ---------------------------------------------------------------------------

describe('NotificationPayload factory helpers', () => {
  it('createNotificationPayload sets title, body, and data', () => {
    const p = createNotificationPayload('Title', 'Body', { key: 'value' });
    expect(p.title).toBe('Title');
    expect(p.body).toBe('Body');
    expect(p.data).toEqual({ key: 'value' });
  });

  it('createNotificationPayload defaults data to empty object', () => {
    const p = createNotificationPayload('T', 'B');
    expect(p.data).toEqual({});
  });

  it('createAlertNotification sets type=alert in data', () => {
    const p = createAlertNotification('Alert!', 'Something happened');
    expect(p.title).toBe('Alert!');
    expect(p.body).toBe('Something happened');
    expect(p.data).toEqual({ type: 'alert' });
  });

  it('createMessageNotification sets type=message and threadId', () => {
    const p = createMessageNotification('Alice', 'Hey!', 'thread-42');
    expect(p.title).toBe('Alice');
    expect(p.body).toBe('Hey!');
    expect(p.data).toEqual({ type: 'message', threadId: 'thread-42' });
  });

  it('createSilentNotification has empty title and body', () => {
    const p = createSilentNotification({ jobId: '99' });
    expect(p.title).toBe('');
    expect(p.body).toBe('');
    expect(p.data).toMatchObject({ type: 'silent', jobId: '99' });
  });

  it('createNotificationPayload result can be delivered via InMemoryPushProvider', () => {
    const provider = new InMemoryPushProvider();
    const received: NotificationPayload[] = [];
    provider.onNotification((p) => received.push(p));

    const payload = createMessageNotification('Bob', 'Hello!', 'thread-1');
    provider.simulateNotification(payload);

    expect(received).toHaveLength(1);
    expect(received[0].title).toBe('Bob');
  });
});
