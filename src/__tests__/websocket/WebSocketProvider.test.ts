import { NativeWebSocketProvider } from '../../websocket/WebSocketProvider';

describe('WebSocketProvider', () => {
  it('NativeWebSocketProvider instantiates without error', () => {
    const provider = new NativeWebSocketProvider();
    expect(provider).toBeDefined();
  });
});
