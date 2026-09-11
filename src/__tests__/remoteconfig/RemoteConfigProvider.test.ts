import { InMemoryRemoteConfigProvider } from '../../remoteconfig/RemoteConfigProvider';

describe('RemoteConfigProvider', () => {
  it('InMemoryRemoteConfigProvider round-trips string and bool', () => {
    const provider = new InMemoryRemoteConfigProvider();
    provider.setValue('greeting', 'world');
    provider.setValue('flag', true);
    expect(provider.getString('greeting')).toBe('world');
    expect(provider.getBoolean('flag')).toBe(true);
    expect(provider.getString('missing')).toBeNull();
  });
});
