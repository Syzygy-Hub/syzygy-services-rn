import { FetchNetworkClient } from '../../networking/NetworkClient';

describe('NetworkClient', () => {
  it('FetchNetworkClient instantiates without error', () => {
    const client = new FetchNetworkClient();
    expect(client).toBeDefined();
  });
});
