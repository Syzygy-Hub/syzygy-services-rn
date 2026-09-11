import { JWTAuthProvider } from '../../auth/AuthProvider';

describe('AuthProvider', () => {
  it('JWTAuthProvider stores and clears token', () => {
    const provider = new JWTAuthProvider();
    expect(provider.accessToken).toBeNull();
    provider.storeToken('tok123');
    expect(provider.accessToken).toBe('tok123');
    provider.clearToken();
    expect(provider.accessToken).toBeNull();
  });
});
