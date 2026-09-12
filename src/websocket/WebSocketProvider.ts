/** Current state of a WebSocket connection. */
export type WebSocketConnectionState = 'disconnected' | 'connecting' | 'connected';

/** Handler for incoming messages. */
export type MessageHandler = (message: string | ArrayBuffer) => void;

/** Handler for connection-state changes. */
export type StateChangeHandler = (state: WebSocketConnectionState) => void;

/**
 * Contract for WebSocket connectivity with automatic reconnection support.
 */
export interface WebSocketProvider {
  /** Current connection state. */
  readonly connectionState: WebSocketConnectionState;

  /**
   * Opens a connection to `url` and resolves when the connection is
   * established.
   */
  connect(url: string): Promise<void>;

  /**
   * Sends a text message over the open connection.
   * @throws {@link WebSocketError} when not connected.
   */
  send(message: string): Promise<void>;

  /**
   * Sends binary data over the open connection.
   * @throws {@link WebSocketError} when not connected.
   */
  sendBinary(data: ArrayBuffer | Uint8Array): Promise<void>;

  /**
   * Registers a handler for incoming messages (text or binary).
   * @returns  An unsubscribe function.
   */
  onMessage(handler: MessageHandler): () => void;

  /**
   * Registers a handler for connection-state changes.
   * @returns  An unsubscribe function.
   */
  onStateChange(handler: StateChangeHandler): () => void;

  /** Closes the connection and stops any pending reconnection attempts. */
  disconnect(): void;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Errors thrown by WebSocket providers. */
export class WebSocketError extends Error {
  static notConnected(): WebSocketError {
    return new WebSocketError('WebSocket is not connected');
  }

  constructor(message: string) {
    super(message);
    this.name = 'WebSocketError';
  }
}

// ---------------------------------------------------------------------------
// NativeWebSocketProvider
// ---------------------------------------------------------------------------

/** Options for {@link NativeWebSocketProvider}. */
export interface NativeWebSocketProviderOptions {
  /** Maximum number of automatic reconnection attempts.  Default: 5. */
  maxReconnectAttempts?: number;
  /** Base delay (ms) for exponential back-off between reconnections. Default: 500. */
  reconnectBaseDelayMs?: number;
}

/**
 * WebSocket provider backed by the global `WebSocket` API.
 *
 * Features:
 * - State machine (`disconnected` → `connecting` → `connected`)
 * - Message and state-change listener registration
 * - Automatic reconnection with exponential back-off
 */
export class NativeWebSocketProvider implements WebSocketProvider {
  private ws: WebSocket | null = null;
  private _state: WebSocketConnectionState = 'disconnected';
  private readonly _messageHandlers = new Set<MessageHandler>();
  private readonly _stateHandlers = new Set<StateChangeHandler>();
  private _url: string | null = null;
  private _reconnectAttempt = 0;
  private _reconnecting = false;
  private readonly maxReconnectAttempts: number;
  private readonly reconnectBaseDelayMs: number;

  constructor(options: NativeWebSocketProviderOptions = {}) {
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
    this.reconnectBaseDelayMs = options.reconnectBaseDelayMs ?? 500;
  }

  /** Current connection state. */
  get connectionState(): WebSocketConnectionState {
    return this._state;
  }

  /**
   * Opens a WebSocket connection to `url`.
   * Resolves once the `open` event fires; rejects on error.
   */
  connect(url: string): Promise<void> {
    this._url = url;
    this._reconnectAttempt = 0;
    this._reconnecting = false;
    return this._openConnection(url);
  }

  /**
   * Sends a text message.
   * @throws {@link WebSocketError} when not connected.
   */
  async send(message: string): Promise<void> {
    if (!this.ws || this._state !== 'connected') {
      throw WebSocketError.notConnected();
    }
    this.ws.send(message);
  }

  /**
   * Sends binary data.
   * @throws {@link WebSocketError} when not connected.
   */
  async sendBinary(data: ArrayBuffer | Uint8Array): Promise<void> {
    if (!this.ws || this._state !== 'connected') {
      throw WebSocketError.notConnected();
    }
    this.ws.send(data);
  }

  /**
   * Registers `handler` for incoming messages.
   * @returns  Unsubscribe function.
   */
  onMessage(handler: MessageHandler): () => void {
    this._messageHandlers.add(handler);
    return (): void => {
      this._messageHandlers.delete(handler);
    };
  }

  /**
   * Registers `handler` for connection-state changes.
   * @returns  Unsubscribe function.
   */
  onStateChange(handler: StateChangeHandler): () => void {
    this._stateHandlers.add(handler);
    return (): void => {
      this._stateHandlers.delete(handler);
    };
  }

  /**
   * Closes the connection and cancels any pending reconnection.
   */
  disconnect(): void {
    this._reconnecting = false;
    this._url = null;
    this.ws?.close();
    this.ws = null;
    this._setState('disconnected');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _openConnection(url: string): Promise<void> {
    this._setState('connecting');
    return new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url);
      this.ws = socket;

      socket.onopen = (): void => {
        this._reconnectAttempt = 0;
        this._setState('connected');
        resolve();
      };

      socket.onerror = (evt): void => {
        reject(new WebSocketError(`WebSocket error: ${String(evt)}`));
      };

      socket.onclose = (): void => {
        this._setState('disconnected');
        this._scheduleReconnect();
      };

      socket.onmessage = (evt): void => {
        const data = evt.data as string | ArrayBuffer;
        this._messageHandlers.forEach((h) => h(data));
      };
    });
  }

  private _setState(next: WebSocketConnectionState): void {
    this._state = next;
    this._stateHandlers.forEach((h) => h(next));
  }

  private _scheduleReconnect(): void {
    if (!this._url || this._reconnecting || this._reconnectAttempt >= this.maxReconnectAttempts) {
      return;
    }
    this._reconnecting = true;
    const delay = this.reconnectBaseDelayMs * Math.pow(2, this._reconnectAttempt);
    this._reconnectAttempt++;

    setTimeout(() => {
      if (!this._url) {
        this._reconnecting = false;
        return;
      }
      this._reconnecting = false;
      this._openConnection(this._url).catch(() => {
        /* handled by onclose recursion */
      });
    }, delay);
  }
}

// ---------------------------------------------------------------------------
// InMemoryWebSocketProvider (testing)
// ---------------------------------------------------------------------------

/**
 * In-memory {@link WebSocketProvider} for unit tests.
 *
 * - `connect()` resolves immediately and sets state to `'connected'`.
 * - `send()` / `sendBinary()` push the message into a log and can be
 *   inspected via `.sentMessages`.
 * - Deliver messages to handlers by calling `simulateMessage()`.
 * - Simulate a server-initiated disconnect with `simulateDisconnect()`.
 */
export class InMemoryWebSocketProvider implements WebSocketProvider {
  private _state: WebSocketConnectionState = 'disconnected';
  private readonly _messageHandlers = new Set<MessageHandler>();
  private readonly _stateHandlers = new Set<StateChangeHandler>();

  /** Log of all messages passed to {@link send} or {@link sendBinary}. */
  readonly sentMessages: Array<string | ArrayBuffer> = [];

  /** Current connection state. */
  get connectionState(): WebSocketConnectionState {
    return this._state;
  }

  /**
   * Immediately transitions to `'connected'`.
   */
  async connect(_url: string): Promise<void> {
    this._setState('connecting');
    this._setState('connected');
  }

  /**
   * Stores `message` in {@link sentMessages}.
   * @throws {@link WebSocketError} when not connected.
   */
  async send(message: string): Promise<void> {
    if (this._state !== 'connected') throw WebSocketError.notConnected();
    this.sentMessages.push(message);
  }

  /**
   * Stores `data` in {@link sentMessages}.
   * @throws {@link WebSocketError} when not connected.
   */
  async sendBinary(data: ArrayBuffer | Uint8Array): Promise<void> {
    if (this._state !== 'connected') throw WebSocketError.notConnected();
    const buf: ArrayBuffer =
      data instanceof Uint8Array
        ? (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
        : data;
    this.sentMessages.push(buf);
  }

  onMessage(handler: MessageHandler): () => void {
    this._messageHandlers.add(handler);
    return (): void => {
      this._messageHandlers.delete(handler);
    };
  }

  onStateChange(handler: StateChangeHandler): () => void {
    this._stateHandlers.add(handler);
    return (): void => {
      this._stateHandlers.delete(handler);
    };
  }

  /** Closes the connection immediately. */
  disconnect(): void {
    this._setState('disconnected');
  }

  /**
   * Delivers `message` to all registered {@link onMessage} handlers.
   * Use in tests to simulate server-to-client messages.
   */
  simulateMessage(message: string | ArrayBuffer): void {
    this._messageHandlers.forEach((h) => h(message));
  }

  /**
   * Simulates a server-initiated disconnect.
   */
  simulateDisconnect(): void {
    this._setState('disconnected');
  }

  private _setState(next: WebSocketConnectionState): void {
    this._state = next;
    this._stateHandlers.forEach((h) => h(next));
  }
}
