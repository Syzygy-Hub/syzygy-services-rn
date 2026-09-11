import { InMemoryPushProvider } from '../../pushnotifications/PushProvider';

describe('PushProvider', () => {
  it('InMemoryPushProvider stores token', () => {
    const provider = new InMemoryPushProvider();
    expect(provider.deviceToken).toBeNull();
    provider.registerToken('my-token');
    expect(provider.deviceToken).toBe('my-token');
  });
});
