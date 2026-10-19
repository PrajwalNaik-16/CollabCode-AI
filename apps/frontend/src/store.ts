import { create } from 'zustand';
import { useAuthStore } from './store/authStore';
import { API_URL } from './config';

export interface FileData {
  id: string;
  name: string;
  createdAt: string;
}

interface UserProfile {
  name: string;
  color: string;
}

interface EditorState {
  activeFileId: string | null;
  openFileIds: string[];           // tabs that are open
  profile: UserProfile;
  isConnected: boolean;
  onlineUsers: UserProfile[];
  files: FileData[];

  setActiveFile: (id: string) => void;
  closeFile: (id: string) => void;
  setConnectionStatus: (status: boolean) => void;
  setOnlineUsers: (users: UserProfile[]) => void;
  setProfileName: (name: string) => void;
  fetchFiles: (roomId: string) => Promise<void>;
  createFile: (roomId: string, name: string) => Promise<void>;
  renameFile: (roomId: string, fileId: string, newName: string) => Promise<void>;
  deleteFile: (roomId: string, fileId: string) => Promise<void>;
}

const PRESENCE_COLORS = [
  '#ff7b72', '#ffa657', '#e3b341', '#3fb950',
  '#79c0ff', '#d2a8ff', '#f778ba', '#56d364',
];
const randomColor = () => PRESENCE_COLORS[Math.floor(Math.random() * PRESENCE_COLORS.length)];
let latestFilesRequest = 0;

export const useStore = create<EditorState>((set, get) => ({
  activeFileId: null,
  openFileIds: [],
  profile: {
    name: useAuthStore.getState().user?.name || 'Anonymous',
    color: randomColor(),
  },
  isConnected: false,
  onlineUsers: [],
  files: [],

  setActiveFile: (id) => {
    const { openFileIds } = get();
    set({
      activeFileId: id,
      openFileIds: openFileIds.includes(id) ? openFileIds : [...openFileIds, id],
    });
  },

  closeFile: (id) => {
    const { openFileIds, activeFileId } = get();
    const remaining = openFileIds.filter(fid => fid !== id);
    let nextActive = activeFileId;
    if (activeFileId === id) {
      // Pick adjacent tab or null
      const idx = openFileIds.indexOf(id);
      const next = remaining[idx] ?? remaining[idx - 1] ?? null;
      nextActive = next;
    }
    set({ openFileIds: remaining, activeFileId: nextActive });
  },

  setConnectionStatus: (status) => set({ isConnected: status }),
  setOnlineUsers: (users) => set({ onlineUsers: users }),
  setProfileName: (name) => set(state => ({
    profile: { ...state.profile, name: name.trim() || 'Anonymous' },
  })),

  fetchFiles: async (roomId: string) => {
    const requestId = ++latestFilesRequest;
    // Drop the previous room's selection before the async request completes.
    // Otherwise RoomProvider can briefly connect Yjs to a stale file ID.
    set({ files: [], activeFileId: null, openFileIds: [] });
    try {
      const token = useAuthStore.getState().token;
      const res = await fetch(`${API_URL}/api/rooms/${roomId}/files`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { useAuthStore.getState().logout(); return; }
      if (!res.ok) throw new Error(`File request failed (${res.status})`);
      const files = await res.json();
      if (requestId !== latestFilesRequest) return;
      const firstId = files[0]?.id ?? null;
      set({ files, activeFileId: firstId, openFileIds: firstId ? [firstId] : [] });
    } catch (e) {
      console.error('Failed to fetch files', e);
    }
  },

  createFile: async (roomId: string, name: string) => {
    try {
      const token = useAuthStore.getState().token;
      const res = await fetch(`${API_URL}/api/rooms/${roomId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
      if (res.status === 401) { useAuthStore.getState().logout(); return; }
      const newFile = await res.json();
      if (res.ok) {
        set(state => ({
          files: [...state.files, newFile],
          activeFileId: newFile.id,
          openFileIds: [...state.openFileIds, newFile.id],
        }));
      }
    } catch (e) {
      console.error('Failed to create file', e);
    }
  },

  renameFile: async (roomId: string, fileId: string, newName: string) => {
    try {
      const token = useAuthStore.getState().token;
      const res = await fetch(`${API_URL}/api/rooms/${roomId}/files/${fileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newName }),
      });
      if (res.ok) {
        const updated = await res.json();
        set(state => ({
          files: state.files.map(f => f.id === fileId ? updated : f),
        }));
      }
    } catch (e) {
      console.error('Failed to rename file', e);
    }
  },

  deleteFile: async (roomId: string, fileId: string) => {
    try {
      const token = useAuthStore.getState().token;
      const res = await fetch(`${API_URL}/api/rooms/${roomId}/files/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        set(state => {
          const remaining = state.files.filter(f => f.id !== fileId);
          const openRemaining = state.openFileIds.filter(id => id !== fileId);
          let nextActive = state.activeFileId;
          if (nextActive === fileId) {
            nextActive = openRemaining[0] ?? null;
          }
          return { files: remaining, openFileIds: openRemaining, activeFileId: nextActive };
        });
      }
    } catch (e) {
      console.error('Failed to delete file', e);
    }
  },
}));
