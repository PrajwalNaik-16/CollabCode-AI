import { createContext, useContext } from 'react';
import type { Doc } from 'yjs';
import type { WebrtcProvider } from 'y-webrtc';
import type { WebsocketProvider } from 'y-websocket';

export interface RoomContextType {
  ydoc: Doc | null;
  provider: WebrtcProvider | null;
  wsProvider: WebsocketProvider | null;
}

export const RoomContext = createContext<RoomContextType>({
  ydoc: null,
  provider: null,
  wsProvider: null,
});

export const useRoom = () => useContext(RoomContext);
