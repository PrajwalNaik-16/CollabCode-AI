import type { WebSocket } from 'ws';

const connections = new Map<string, Map<string, Set<WebSocket>>>();

export function trackRoomConnection(roomId: string, userId: string, socket: WebSocket) {
  let users = connections.get(roomId);
  if (!users) {
    users = new Map();
    connections.set(roomId, users);
  }
  let sockets = users.get(userId);
  if (!sockets) {
    sockets = new Set();
    users.set(userId, sockets);
  }
  sockets.add(socket);

  const cleanup = () => {
    sockets?.delete(socket);
    if (sockets?.size === 0 && users?.get(userId) === sockets) users?.delete(userId);
    if (users?.size === 0) connections.delete(roomId);
  };
  socket.once('close', cleanup);
  socket.once('error', cleanup);
}

export function revokeRoomConnections(roomId: string, userId: string) {
  const sockets = connections.get(roomId)?.get(userId);
  if (!sockets) return;
  for (const socket of sockets) {
    if (socket.readyState === 1) socket.close(4003, 'Room access revoked');
  }
}

export function closeRoomConnections(roomId: string) {
  const users = connections.get(roomId);
  if (!users) return;
  for (const sockets of users.values()) {
    for (const socket of sockets) {
      if (socket.readyState === 1) socket.close(4003, 'Room deleted');
    }
  }
}
