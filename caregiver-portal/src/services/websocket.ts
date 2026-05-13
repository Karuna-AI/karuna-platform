type MessageHandler = (data: any) => void;
type ConnectionHandler = (connected: boolean) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private connectionHandlers: Set<ConnectionHandler> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30000;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private connectPending: ReturnType<typeof setTimeout> | null = null;
  private circleId: string | null = null;
  private _isConnected = false;
  private intentionalClose = false;

  connect(circleId: string): void {
    this.circleId = circleId;
    this.intentionalClose = false;
    // 50ms defer: lets React StrictMode cleanup cancel this before the WebSocket
    // is ever created, preventing "closed before connection established" console errors.
    this.connectPending = setTimeout(() => {
      this.connectPending = null;
      if (!this.intentionalClose) this.doConnect();
    }, 50);
  }

  private doConnect(): void {
    if (!this.circleId) return;

    try {
      // Determine WS URL from current location.
      // Auth is handled via httpOnly cookie sent automatically on the upgrade request.
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws?circleId=${encodeURIComponent(this.circleId)}`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.debug('[WS] Connected');
        this._isConnected = true;
        this.reconnectAttempts = 0;
        this.notifyConnectionHandlers(true);
        this.startPing();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          const { type, ...data } = message;
          if (type === 'pong') return;
          this.dispatch(type, data);
        } catch (err) {
          console.warn('[WS] Failed to parse message:', err);
        }
      };

      this.ws.onclose = () => {
        console.debug('[WS] Disconnected');
        this._isConnected = false;
        this.notifyConnectionHandlers(false);
        this.stopPing();

        if (!this.intentionalClose) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (err) => {
        console.warn('[WS] Error:', err);
      };
    } catch (err) {
      console.error('[WS] Connection error:', err);
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.stopPing();

    if (this.connectPending) {
      clearTimeout(this.connectPending);
      this.connectPending = null;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Clear all message handlers so they don't accumulate across circle switches
    this.handlers.clear();

    this._isConnected = false;
    this.circleId = null;
    this.reconnectAttempts = 0;
    this.notifyConnectionHandlers(false);
  }

  private scheduleReconnect(): void {
    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );
    this.reconnectAttempts++;
    console.debug(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.doConnect();
    }, delay);
  }

  private startPing(): void {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private dispatch(type: string, data: any): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (err) {
          console.error(`[WS] Handler error for ${type}:`, err);
        }
      });
    }
  }

  onMessage(type: string, handler: MessageHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
  }

  offMessage(type: string, handler: MessageHandler): void {
    this.handlers.get(type)?.delete(handler);
  }

  onConnectionChange(handler: ConnectionHandler): void {
    this.connectionHandlers.add(handler);
  }

  offConnectionChange(handler: ConnectionHandler): void {
    this.connectionHandlers.delete(handler);
  }

  private notifyConnectionHandlers(connected: boolean): void {
    this.connectionHandlers.forEach(handler => {
      try {
        handler(connected);
      } catch (err) {
        console.error('[WS] Connection handler error:', err);
      }
    });
  }

  get isConnected(): boolean {
    return this._isConnected;
  }
}

export const wsService = new WebSocketService();
export default wsService;
