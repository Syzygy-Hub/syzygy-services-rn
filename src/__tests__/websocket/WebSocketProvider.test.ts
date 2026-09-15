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

// ---------------------------------------------------------------------------
// dispose() tests
// ---------------------------------------------------------------------------

describe('InMemoryWebSocketProvider — dispose()', () => {
  it('connect() throws WebSocketError after dispose()', async () => {
    const provider = new InMemoryWebSocketProvider();
    provider.dispose();
    await expect(provider.connect('ws://localhost:9999')).rejects.toBeInstanceOf(WebSocketError);
  });

  it('send() throws WebSocketError after dispose()', async () => {
    const provider = new InMemoryWebSocketProvider();
    await provider.connect('ws://localhost:9999');
    provider.dispose();
    await expect(provider.send('hello')).rejects.toBeInstanceOf(WebSocketError);
  });

  it('sendBinary() throws WebSocketError after dispose()', async () => {
    const provider = new InMemoryWebSocketProvider();
    await provider.connect('ws://localhost:9999');
    provider.dispose();
    await expect(provider.sendBinary(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(
      WebSocketError,
    );
  });

  it('dispose() transitions provider to disconnected state', async () => {
    const provider = new InMemoryWebSocketProvider();
    await provider.connect('ws://localhost:9999');
    expect(provider.connectionState).toBe('connected');
    provider.dispose();
    expect(provider.connectionState).toBe('disconnected');
  });

  it('dispose() called multiple times is a safe no-op', async () => {
    const provider = new InMemoryWebSocketProvider();
    await provider.connect('ws://localhost:9999');
    expect(() => {
      provider.dispose();
      provider.dispose();
      provider.dispose();
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Binary send / receive tests
// ---------------------------------------------------------------------------

describe('InMemoryWebSocketProvider — binary send/receive', () => {
  it('sendBinary with ArrayBuffer stores the buffer in sentMessages', async () => {
    const provider = new InMemoryWebSocketProvider();
    await provider.connect('ws://localhost:9999');

    const buffer = new Uint8Array([0xde, 0xad, 0xbe, 0xef]).buffer;
    await provider.sendBinary(buffer);

    expect(provider.sentMessages).toHaveLength(1);
    const stored = provider.sentMessages[0] as ArrayBuffer;
    expect(new Uint8Array(stored)).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
  });

  it('sendBinary with Uint8Array stores an equivalent ArrayBuffer', async () => {
    const provider = new InMemoryWebSocketProvider();
    await provider.connect('ws://localhost:9999');

    const data = new Uint8Array([1, 2, 3, 4, 5]);
    await provider.sendBinary(data);

    expect(provider.sentMessages).toHaveLength(1);
    const stored = provider.sentMessages[0] as ArrayBuffer;
    expect(stored).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(stored)).toEqual(data);
  });

  it('receive binary ArrayBuffer via onMessage callback', async () => {
    const provider = new InMemoryWebSocketProvider();
    await provider.connect('ws://localhost:9999');

    const received: (string | ArrayBuffer)[] = [];
    provider.onMessage((m) => received.push(m));

    const binaryPayload = new Uint8Array([0x01, 0x02, 0x03]).buffer;
    provider.simulateMessage(binaryPayload);

    expect(received).toHaveLength(1);
    expect(received[0]).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(received[0] as ArrayBuffer)).toEqual(new Uint8Array([0x01, 0x02, 0x03]));
  });

  it('mixed text and binary messages are delivered in order', async () => {
    const provider = new InMemoryWebSocketProvider();
    await provider.connect('ws://localhost:9999');

    const received: (string | ArrayBuffer)[] = [];
    provider.onMessage((m) => received.push(m));

    provider.simulateMessage('hello');
    provider.simulateMessage(new Uint8Array([0xaa, 0xbb]).buffer);
    provider.simulateMessage('world');
    provider.simulateMessage(new Uint8Array([0xcc]).buffer);

    expect(received).toHaveLength(4);
    expect(received[0]).toBe('hello');
    expect(received[1]).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(received[1] as ArrayBuffer)).toEqual(new Uint8Array([0xaa, 0xbb]));
    expect(received[2]).toBe('world');
    expect(new Uint8Array(received[3] as ArrayBuffer)).toEqual(new Uint8Array([0xcc]));
  });

  it('sendBinary then send text — both appear in sentMessages', async () => {
    const provider = new InMemoryWebSocketProvider();
    await provider.connect('ws://localhost:9999');

    await provider.sendBinary(new Uint8Array([0xff]).buffer);
    await provider.send('text-msg');

    expect(provider.sentMessages).toHaveLength(2);
    expect(provider.sentMessages[0]).toBeInstanceOf(ArrayBuffer);
    expect(provider.sentMessages[1]).toBe('text-msg');
  });

  it('multiple onMessage handlers all receive binary frames', async () => {
    const provider = new InMemoryWebSocketProvider();
    await provider.connect('ws://localhost:9999');

    const receivedA: (string | ArrayBuffer)[] = [];
    const receivedB: (string | ArrayBuffer)[] = [];
    provider.onMessage((m) => receivedA.push(m));
    provider.onMessage((m) => receivedB.push(m));

    const buf = new Uint8Array([0x10, 0x20]).buffer;
    provider.simulateMessage(buf);

    expect(receivedA).toHaveLength(1);
    expect(receivedB).toHaveLength(1);
    expect(new Uint8Array(receivedA[0] as ArrayBuffer)).toEqual(new Uint8Array([0x10, 0x20]));
  });
});

// ---------------------------------------------------------------------------
// onBinaryMessage — dedicated binary-frame stream (mirrors Android binaryMessages Flow)
// ---------------------------------------------------------------------------

describe('InMemoryWebSocketProvider — onBinaryMessage (Android binaryMessages parity)', () => {
  it('simulateBinaryMessage delivers Uint8Array to onBinaryMessage handler', async () => {
    const provider = new InMemoryWebSocketProvider();
    await provider.connect('ws://localhost:9999');

    const received: Uint8Array[] = [];
    provider.onBinaryMessage((b) => received.push(b));

    provider.simulateBinaryMessage(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

    expect(received).toHaveLength(1);
    expect(received[0]).toBeInstanceOf(Uint8Array);
    expect(received[0]).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
  });

  it('simulateBinaryMessage wraps ArrayBuffer to Uint8Array', async () => {
    const provider = new InMemoryWebSocketProvider();
    await provider.connect('ws://localhost:9999');

    const received: Uint8Array[] = [];
    provider.onBinaryMessage((b) => received.push(b));

    provider.simulateBinaryMessage(new Uint8Array([0x01, 0x02, 0x03]).buffer);

    expect(received).toHaveLength(1);
    expect(received[0]).toBeInstanceOf(Uint8Array);
    expect(received[0]).toEqual(new Uint8Array([0x01, 0x02, 0x03]));
  });

  it('onBinaryMessage handler does NOT fire for text messages', async () => {
    const provider = new InMemoryWebSocketProvider();
    await provider.connect('ws://localhost:9999');

    const binaryReceived: Uint8Array[] = [];
    provider.onBinaryMessage((b) => binaryReceived.push(b));

    provider.simulateMessage('text-only');

    expect(binaryReceived).toHaveLength(0);
  });

  it('onMessage handler fires for both text and binary (mixed stream)', async () => {
    const provider = new InMemoryWebSocketProvider();
    await provider.connect('ws://localhost:9999');

    const allMessages: (string | ArrayBuffer)[] = [];
    const binaryOnly: Uint8Array[] = [];
    provider.onMessage((m) => allMessages.push(m));
    provider.onBinaryMessage((b) => binaryOnly.push(b));

    provider.simulateMessage('hello');
    provider.simulateBinaryMessage(new Uint8Array([0xaa]));
    provider.simulateMessage('world');
    provider.simulateBinaryMessage(new Uint8Array([0xbb, 0xcc]));

    // onMessage receives all text, onBinaryMessage only binary
    expect(allMessages).toHaveLength(2); // only calls to simulateMessage reach onMessage
    expect(binaryOnly).toHaveLength(2);
    expect(binaryOnly[0]).toEqual(new Uint8Array([0xaa]));
    expect(binaryOnly[1]).toEqual(new Uint8Array([0xbb, 0xcc]));
  });

  it('multiple onBinaryMessage handlers all receive the same frame', async () => {
    const provider = new InMemoryWebSocketProvider();
    await provider.connect('ws://localhost:9999');

    const handlerA: Uint8Array[] = [];
    const handlerB: Uint8Array[] = [];
    provider.onBinaryMessage((b) => handlerA.push(b));
    provider.onBinaryMessage((b) => handlerB.push(b));

    provider.simulateBinaryMessage(new Uint8Array([0x10, 0x20, 0x30]));

    expect(handlerA).toHaveLength(1);
    expect(handlerB).toHaveLength(1);
    expect(handlerA[0]).toEqual(new Uint8Array([0x10, 0x20, 0x30]));
    expect(handlerB[0]).toEqual(new Uint8Array([0x10, 0x20, 0x30]));
  });

  it('onBinaryMessage unsubscribe stops binary frame delivery', async () => {
    const provider = new InMemoryWebSocketProvider();
    await provider.connect('ws://localhost:9999');

    const received: Uint8Array[] = [];
    const unsub = provider.onBinaryMessage((b) => received.push(b));

    provider.simulateBinaryMessage(new Uint8Array([0x01]));
    unsub();
    provider.simulateBinaryMessage(new Uint8Array([0x02]));

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(new Uint8Array([0x01]));
  });

  it('empty binary frame (zero-length) is delivered correctly', async () => {
    const provider = new InMemoryWebSocketProvider();
    await provider.connect('ws://localhost:9999');

    const received: Uint8Array[] = [];
    provider.onBinaryMessage((b) => received.push(b));

    provider.simulateBinaryMessage(new Uint8Array([]));

    expect(received).toHaveLength(1);
    expect(received[0]).toBeInstanceOf(Uint8Array);
    expect(received[0].byteLength).toBe(0);
  });
});
