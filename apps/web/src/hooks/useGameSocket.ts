import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { ServerMessageSchema, type ClientMessage, type PlayerView, type ServerMessage } from '@beer/game';

const FIRST_RETRY_MS = 500;
const MAX_RETRY_MS = 8_000;

export type GameSocket = {
  /** The latest snapshot from the server; null until the first one arrives. */
  view: PlayerView | null;
  connected: boolean;
  /** The last error the server sent this socket. Cleared when the round changes or a new order is sent. */
  lastError: string | null;
  /** True between sending an order and the server's answer. */
  sendingOrder: boolean;
  placeOrder: (quantity: number) => void;
  /** Asks the server to seat bots in the free roles. Returns false if the socket is not open. */
  fillWithBots: () => boolean;
};

/**
 * Keeps one WebSocket open for a game. On every (re)connect it says `hello` with
 * the current token, so the server binds the socket to the player's role again.
 * The server always sends full snapshots, so a reconnect needs no catching up.
 */
export function useGameSocket(code: string, token: string | null): GameSocket {
  const [view, setView] = useState<PlayerView | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [sendingOrder, setSendingOrder] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  // Reads the latest token without making it a dependency of the connection effect.
  const sendHello = useEffectEvent(() => {
    send(socketRef.current, { type: 'hello', code, token: token ?? undefined });
  });

  useEffect(() => {
    let socket: WebSocket;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let round: number | null = null;
    let disposed = false;

    function connect() {
      socket = new WebSocket(socketUrl());
      socketRef.current = socket;

      socket.onopen = () => {
        if (disposed) return;
        attempt = 0;
        setConnected(true);
        sendHello();
      };

      socket.onmessage = (event) => {
        if (disposed) return;
        const message = parseMessage(event.data);
        if (!message) return;

        if (message.type === 'error') {
          setSendingOrder(false);
          setLastError(message.message);
          return;
        }

        const next = message.view;
        // Another player's broadcast can arrive before ours is processed; the order is
        // only settled once the server shows it, or the round (or game) has moved on.
        if ((next.me && next.me.pendingOrder !== null) || next.round !== round || next.status !== 'playing') {
          setSendingOrder(false);
        }
        // An error about last round's order is stale once the round has moved on.
        if (next.round !== round) setLastError(null);
        round = next.round;
        setView(next);
      };

      socket.onclose = () => {
        if (disposed) return;
        setConnected(false);
        setSendingOrder(false);
        retryTimer = setTimeout(connect, Math.min(FIRST_RETRY_MS * 2 ** attempt++, MAX_RETRY_MS));
      };
    }

    connect();
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      socket.close();
      socketRef.current = null;
    };
  }, [code]);

  // Joining a role hands us a token: re-introduce this socket instead of reconnecting.
  useEffect(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) sendHello();
  }, [token]);

  const placeOrder = useCallback((quantity: number) => {
    if (!send(socketRef.current, { type: 'placeOrder', quantity })) {
      setLastError('Not connected, so the order was not sent. Try again in a moment.');
      return;
    }
    setLastError(null);
    setSendingOrder(true);
  }, []);

  const fillWithBots = useCallback(() => {
    if (!send(socketRef.current, { type: 'fillWithBots' })) {
      setLastError('Not connected. Try again in a moment.');
      return false;
    }
    setLastError(null);
    return true;
  }, []);

  return { view, connected, lastError, sendingOrder, placeOrder, fillWithBots };
}

function socketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

function send(socket: WebSocket | null, message: ClientMessage): boolean {
  if (socket?.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(message));
  return true;
}

function parseMessage(data: unknown): ServerMessage | null {
  try {
    const result = ServerMessageSchema.safeParse(JSON.parse(String(data)));
    if (result.success) return result.data;
    console.warn('Ignoring unexpected server message', result.error);
  } catch {
    console.warn('Ignoring a server message that is not JSON');
  }
  return null;
}
