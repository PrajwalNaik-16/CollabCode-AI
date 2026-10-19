import React, { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { WebsocketProvider } from 'y-websocket';
import { useStore } from '../store';
import { useAuthStore } from '../store/authStore';
import { WS_URL } from '../config';
import { RoomContext } from './roomContextValue';

export const RoomProvider: React.FC<{ roomName: string; children: React.ReactNode }> = ({
  roomName,
  children,
}) => {
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [provider, setProvider] = useState<WebrtcProvider | null>(null);
  const [wsProvider, setWsProvider] = useState<WebsocketProvider | null>(null);
  const { profile, setConnectionStatus, setOnlineUsers, setProfileName, activeFileId } = useStore();
  const user = useAuthStore(state => state.user);

  useEffect(() => {
    setProfileName(user?.name || 'Anonymous');
  }, [user?.name, setProfileName]);

  useEffect(() => {
    if (!activeFileId) return;

    const token = useAuthStore.getState().token;
    const doc = new Y.Doc();

    // ── WebRTC: use the ROOM NAME as the signaling room key
    const webrtcProvider = new WebrtcProvider(
      `${roomName}/${activeFileId}`,   // unique Yjs room per file
      doc,
      {
        signaling: [`${WS_URL}/webrtc?token=${encodeURIComponent(token || '')}&room=${encodeURIComponent(`${roomName}-${activeFileId}`)}&roomName=${encodeURIComponent(roomName)}&fileId=${encodeURIComponent(activeFileId)}`],
      }
    );

    // ── y-websocket: room name is the FILE ID (for per-file Yjs persistence)
    const ws = new WebsocketProvider(`${WS_URL}/yjs`, activeFileId, doc, {
      params: { token: token as string },
    });

    // ── Presence
    webrtcProvider.awareness.setLocalStateField('user', profile);

    const updateStatus = () => {
      // The database sync WebSocket must be connected and synced before edits
      // are reported as safely shared/persisted. WebRTC signaling alone is not enough.
      setConnectionStatus(ws.wsconnected && ws.synced);
    };

    webrtcProvider.on('status', updateStatus);
    ws.on('sync', updateStatus);

    webrtcProvider.awareness.on('change', () => {
      const states = Array.from(webrtcProvider.awareness.getStates().values());
      const users = states
        .map((s: Record<string, any>) => s.user)
        .filter((u) => u !== undefined);
      setOnlineUsers(users);
    });

    setYdoc(doc);
    setProvider(webrtcProvider);
    setWsProvider(ws);

    return () => {
      setConnectionStatus(false);
      webrtcProvider.off('status', updateStatus);
      ws.off('sync', updateStatus);
      webrtcProvider.destroy();
      ws.destroy();
      doc.destroy();
      setYdoc(null);
      setProvider(null);
      setWsProvider(null);
    };
  }, [roomName, activeFileId]);

  useEffect(() => {
    if (provider) {
      provider.awareness.setLocalStateField('user', profile);
    }
  }, [profile, provider]);

  return (
    <RoomContext.Provider value={{ ydoc, provider, wsProvider }}>
      {children}
    </RoomContext.Provider>
  );
};
