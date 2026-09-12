import { InMemoryWebSocketProvider, WebSocketError } from '../../websocket/WebSocketProvider';
import type { WebSocketConnectionState } from '../../websocket/WebSocketProvider';

describe('InMemoryWebSocketProvider', () => {
  it('starts in disconnected state', () => {
    const provider = new InMemoryWebSocketProvider();
    expect(provider.connectionState).toBe('disconnected');
  });

  it('connect transitions through connecting → connected', async () => {
    const provider = new InMemoryWebSocketProvider();
    const states: WebSocketConnectionState[] = [];
    provider.onStateChange((s) => states.push(s));
    await provider.connect('ws://localhost:9999');
    expect(provider.connectionState).toBe('connected');
    expect(states).toEqual(['connecting', 'connected']);
  });

  it('send stores the message in sentMessages', async () => {
    const provider = new InMemoryWebSocketProvider();
    await provider.connect('ws://localhost:9999');
    await provider.send('hello');
    expect(provider.sentMessages).toEqual(['hello']);
  });

  it('send throws WebSocketError when not connected', async () => {
    const provider = new InMemoryWebSocketProvider();
    await expect(provider.send('test')).rejects.toBeInstanceOf(WebSocketError);
  });

  it('sendBinary stores data in sentMessages', async () => {
    const provider = new InMemoryWebSocketProvider();
    await provider.connect('ws://localhost:9999');
    const data = new Uint8Array([1, 2, 3]);
    await provider.sendBinary(data);
    expect(provider.sentMessages).toHaveLength(1);
  });

  it('sendBinary throws WebSocketError when not connected', async () => {
    const provider = new InMemoryWebSocketProvider();
    await expect(provider.sendBinary(new Uint8Array([1]))).rejects.toBeInstanceOf(WebSocketError);
  });

  it('simulateMessage delivers to all onMessage handlers', async () => {
    const provider = new InMemoryWebSocketProvider();
    await provider.connect('ws://localhost:9999');
    const received: (string | ArrayBuffer)[] = [];
    provider.onMessage((m) => received.push(m));
    provider.simulateMessage('server-push');
    expect(received).toEqual(['server-push']);
  });

  it('onMessage unsubscribe stops delivery', async () => {
    const provider = new InMemoryWebSocketProvider();
    await provider.connect('ws://localhost:9999');
    const received: string[] = [];
    const unsub = provider.onMessage((m) => received.push(m as string));
    unsub();
    provider.simulateMessage('should-not-arrive');
    expect(received).toHaveLength(0);
  });

  it('disconnect transitions to disconnected', async () => {
    const provider = new InMemoryWebSocketProvider();
    await provider.connect('ws://localhost:9999');
    provider.disconnect();
    expect(provider.connectionState).toBe('disconnected');
  });

  it('simulateDisconnect transitions to disconnected', async () => {
    const provider = new InMemoryWebSocketProvider();
    await provider.connect('ws://localhost:9999');
    provider.simulateDisconnect();
    expect(provider.connectionState).toBe('disconnected');
  });

  it('onStateChange unsubscribe stops notifications', async () => {
    const provider = new InMemoryWebSocketProvider();
    const states: WebSocketConnectionState[] = [];
    const unsub = provider.onStateChange((s) => states.push(s));
    await provider.connect('ws://localhost:9999');
    unsub();
    provider.disconnect();
    // Only connecting + connected received, not the disconnect
    expect(states).toEqual(['connecting', 'connected']);
  });
});

describe('WebSocketError', () => {
  it('notConnected factory returns a WebSocketError', () => {
    const err = WebSocketError.notConnected();
    expect(err).toBeInstanceOf(WebSocketError);
    expect(err.name).toBe('WebSocketError');
  });
});
