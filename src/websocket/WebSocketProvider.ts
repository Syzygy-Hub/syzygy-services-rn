/**
 * Defines the contract for WebSocket connectivity.
 */
export interface WebSocketProvider {
  /** Opens a WebSocket connection to the given `url`. */
  connect(url: string): Promise<void>;
  /** Sends a text `message` over the connection. */
  send(message: string): Promise<void>;
  /** Returns a Promise that resolves with the next received message. */
  receive(): Promise<string>;
  /** Closes the WebSocket connection. */
  disconnect(): void;
}

/** Errors thrown by {@link NativeWebSocketProvider}. */
export class WebSocketError extends Error {
  static notConnected(): WebSocketError {
    return new WebSocketError('WebSocket is not connected');
  }
  constructor(message: string) { super(message); this.name = 'WebSocketError'; }
}

/**
 * A {@link WebSocketProvider} backed by the global `WebSocket` API.
 * In Node.js test environments use the stub below.
 */
export class NativeWebSocketProvider implements WebSocketProvider {
  private ws: WebSocket | null = null;

  async connect(url: string): Promise<void> {
    this.ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      this.ws!.onopen = () => resolve();
      this.ws!.onerror = (e) => reject(e);
    });
  }

  async send(message: string): Promise<void> {
    if (!this.ws) throw WebSocketError.notConnected();
    this.ws.send(message);
  }

  async receive(): Promise<string> {
    if (!this.ws) throw WebSocketError.notConnected();
    return new Promise((resolve) => {
      this.ws!.onmessage = (e) => resolve(e.data as string);
    });
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}
