import type { WebSocket } from 'ws';
import { toPlayerView, type GameState, type Role, type ServerMessage } from '@beer/game';

/** Tracks which sockets watch which game, and as which role (null = spectator / lobby). */
export class Hub {
  private readonly games = new Map<string, Map<WebSocket, Role | null>>();

  join(code: string, socket: WebSocket, role: Role | null): void {
    let sockets = this.games.get(code);
    if (!sockets) {
      sockets = new Map();
      this.games.set(code, sockets);
    }
    sockets.set(socket, role);
  }

  leave(code: string, socket: WebSocket): void {
    const sockets = this.games.get(code);
    if (!sockets) return;
    sockets.delete(socket);
    if (sockets.size === 0) this.games.delete(code);
  }

  /** Sends every socket its own snapshot; nobody receives another role's numbers. */
  broadcast(state: GameState): void {
    for (const [socket, role] of this.games.get(state.code) ?? []) {
      send(socket, { type: 'state', view: toPlayerView(state, role) });
    }
  }
}

export function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}
