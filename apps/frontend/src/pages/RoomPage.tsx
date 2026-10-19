import { useEffect, useState, useRef, type FormEvent } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { Editor } from '../components/Editor';
import { Chat } from '../components/Chat';
import { useStore } from '../store';
import { useAuthStore } from '../store/authStore';
import { RoomProvider } from '../contexts/RoomContext';
import { API_URL } from '../config';
import {
  Wifi, WifiOff, FileText, Plus, ArrowLeft, X,
  Pencil, Trash2, Code2, MessageSquare, ChevronRight, Copy, Check, Loader2,
} from 'lucide-react';

// ─── Context Menu ─────────────────────────────────────────────────
interface CtxMenu { x: number; y: number; fileId: string; fileName: string; }

function ContextMenu({
  menu, onRename, onDelete, onClose,
}: {
  menu: CtxMenu; onRename: () => void; onDelete: () => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ top: menu.y, left: menu.x }}
    >
      <button className="context-menu-item" onClick={() => { onRename(); onClose(); }}>
        <Pencil size={13} /> Rename
      </button>
      <div className="context-menu-divider" />
      <button className="context-menu-item danger" onClick={() => { onDelete(); onClose(); }}>
        <Trash2 size={13} /> Delete
      </button>
    </div>
  );
}

// ─── File Sidebar ──────────────────────────────────────────────────
function FileSidebar({ roomId, onFileSelected }: { roomId: string; onFileSelected?: () => void }) {
  const {
    files, activeFileId, openFileIds,
    setActiveFile, createFile, renameFile, deleteFile,
  } = useStore();

  const [isCreating, setIsCreating] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (newFileName.trim()) {
      await createFile(roomId, newFileName.trim());
      setNewFileName('');
      setIsCreating(false);
      onFileSelected?.();
    }
  };

  const startRename = (fileId: string, currentName: string) => {
    setRenamingId(fileId);
    setRenameValue(currentName);
  };

  const commitRename = (fileId: string) => {
    if (renameValue.trim()) renameFile(roomId, fileId, renameValue.trim());
    setRenamingId(null);
  };

  const handleContextMenu = (e: React.MouseEvent, fileId: string, fileName: string) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, fileId, fileName });
  };

  return (
    <div className="sidebar">
      {ctxMenu && (
        <ContextMenu
          menu={ctxMenu}
          onRename={() => startRename(ctxMenu.fileId, ctxMenu.fileName)}
          onDelete={() => deleteFile(roomId, ctxMenu.fileId)}
          onClose={() => setCtxMenu(null)}
        />
      )}

      <div className="sidebar-header">
        <span className="sidebar-title">Explorer</span>
        <button
          className="btn-icon"
          onClick={() => setIsCreating(true)}
          title="New file"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="sidebar-body">
        {isCreating && (
          <form onSubmit={handleCreate} className="sidebar-create-form">
            <FileText size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              autoFocus
              className="sidebar-create-input"
              value={newFileName}
              onChange={e => setNewFileName(e.target.value)}
              onBlur={() => setIsCreating(false)}
              placeholder="filename.js"
            />
          </form>
        )}

        {files.length === 0 && !isCreating && (
          <div className="sidebar-empty">
            <FileText size={28} />
            <p>No files yet</p>
            <button
              className="btn btn-ghost"
              style={{ fontSize: '11px', padding: '4px 10px', marginTop: '4px' }}
              onClick={() => setIsCreating(true)}
            >
              <Plus size={12} /> Create file
            </button>
          </div>
        )}

        {files.map(file => (
          <div
            key={file.id}
            className={`sidebar-file ${activeFileId === file.id ? 'active' : ''} ${openFileIds.includes(file.id) ? 'open' : ''}`}
            onClick={() => { setActiveFile(file.id); onFileSelected?.(); }}
            onContextMenu={e => handleContextMenu(e, file.id, file.name)}
          >
            <FileText size={13} className="sidebar-file-icon" />

            {renamingId === file.id ? (
              <input
                autoFocus
                className="sidebar-rename-input"
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={() => commitRename(file.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitRename(file.id);
                  if (e.key === 'Escape') setRenamingId(null);
                }}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span className="sidebar-file-name truncate">{file.name}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab Bar ──────────────────────────────────────────────────────
function TabBar() {
  const { files, openFileIds, activeFileId, setActiveFile, closeFile } = useStore();
  const openFiles = openFileIds.map(id => files.find(f => f.id === id)).filter(Boolean) as typeof files;

  if (openFiles.length === 0) return null;

  return (
    <div className="tabbar">
      {openFiles.map(file => (
        <div
          key={file.id}
          className={`tab ${activeFileId === file.id ? 'active' : ''}`}
          onClick={() => setActiveFile(file.id)}
          title={file.name}
        >
          <FileText size={12} className="tab-icon" />
          <span className="tab-name">{file.name}</span>
          <button
            className="tab-close btn-icon"
            onClick={e => { e.stopPropagation(); closeFile(file.id); }}
            title="Close tab"
          >
            <X size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Room Content ──────────────────────────────────────────────────
function RoomContent({ roomId }: { roomId: string }) {
  const { isConnected, onlineUsers, profile, activeFileId, fetchFiles } = useStore();
  const navigate = useNavigate();
  const [showChat, setShowChat] = useState(true);
  const [isCompact, setIsCompact] = useState(() => window.matchMedia('(max-width: 900px)').matches);
  const [compactPane, setCompactPane] = useState<'files' | 'editor' | 'chat'>('editor');
  const [copied, setCopied] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [shareError, setShareError] = useState('');

  const { token: authToken } = useAuthStore();
  useEffect(() => { fetchFiles(roomId); }, [roomId]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const updateLayout = () => setIsCompact(media.matches);
    media.addEventListener('change', updateLayout);
    return () => media.removeEventListener('change', updateLayout);
  }, []);

  // Get the actual room ID (UUID) from the room name
  const [roomUUID, setRoomUUID] = useState<string | null>(null);
  useEffect(() => {
    fetch(`${API_URL}/api/rooms`, { headers: { Authorization: `Bearer ${authToken}` } })
      .then(r => r.json())
      .then((rooms: any[]) => {
        const match = rooms.find((r: any) => r.name === roomId);
        if (match) setRoomUUID(match.id);
      })
      .catch(() => {});
  }, [roomId, authToken]);

  const generateInviteLink = async () => {
    if (!roomUUID || generatingLink) return;
    setGeneratingLink(true);
    setShareError('');
    try {
      const res = await fetch(`${API_URL}/api/rooms/${roomUUID}/invite-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ role: 'EDITOR', expiresIn: '7d' }),
      });
      const data = await res.json();
      if (res.ok) {
        const inviteUrl = `${window.location.origin}/join/${data.token}`;
        navigator.clipboard.writeText(inviteUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } else {
        throw new Error(data.error || 'Only the room owner can create an invite link.');
      }
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Could not create invite link.');
    } finally {
      setGeneratingLink(false);
    }
  };

  return (
    <div className="room-layout">
      {/* ── Header ── */}
      <header className="room-header">
        <div className="room-header-left">
          <button className="btn-icon" onClick={() => navigate('/dashboard')} title="Dashboard">
            <ArrowLeft size={16} />
          </button>
          <Link to="/dashboard" className="room-header-logo" title="Go to dashboard" aria-label="CollabCode AI dashboard">
            <Code2 size={15} />
          </Link>
          <div className="room-breadcrumb">
            <span className="room-breadcrumb-root">workspace</span>
            <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />
            <span className="room-breadcrumb-name">{roomId}</span>
          </div>
        </div>

        <div className="room-header-right">
          {/* Online users */}
          <div className="room-presence">
            {onlineUsers.slice(0, 5).map((u, i) => (
              <div
                key={i}
                className="room-avatar"
                style={{ background: u.color, zIndex: 10 - i }}
                title={u.name}
              >
                {u.name.charAt(0).toUpperCase()}
              </div>
            ))}
            {onlineUsers.length > 5 && (
              <div className="room-avatar room-avatar-more">+{onlineUsers.length - 5}</div>
            )}
            {onlineUsers.length > 0 && (
              <span className="room-presence-count">{onlineUsers.length} online</span>
            )}
          </div>

          <div className="room-header-divider" />

          {/* My identity */}
          <div className="room-identity">
            <div className="room-identity-dot" style={{ background: profile.color }} />
            <span>{profile.name}</span>
          </div>

          {/* Connection status */}
          <div className={`room-status ${isConnected ? 'synced' : 'connecting'}`}>
            {isConnected ? <Wifi size={13} /> : <WifiOff size={13} />}
            <span>{isConnected ? 'Synced' : 'Connecting...'}</span>
          </div>

          <button
            className="btn btn-ghost"
            style={{ fontSize: '12px', padding: '4px 10px' }}
            onClick={generateInviteLink}
            disabled={generatingLink || !roomUUID}
            title={roomUUID ? 'Generate & copy invite link' : 'Loading room details'}
          >
            {generatingLink
              ? <Loader2 size={13} className="animate-spin" />
              : copied
                ? <Check size={13} style={{ color: 'var(--accent-success)' }} />
                : <Copy size={13} />}
            {copied ? 'Copied!' : 'Share'}
          </button>
          {shareError && <span role="alert" style={{ color: 'var(--accent-danger)', fontSize: '11px' }}>{shareError}</span>}

          {/* Toggle chat */}
          <button
            className={`btn-icon ${showChat ? 'active' : ''}`}
            style={showChat ? { background: 'var(--accent-primary-muted)', color: 'var(--accent-primary-hover)' } : {}}
            onClick={() => { setShowChat(v => !v); if (showChat) setCompactPane('editor'); }}
            title="Toggle chat"
          >
            <MessageSquare size={16} />
          </button>
        </div>
      </header>

      {/* ── Body: Sidebar + Editor + Chat ── */}
      <div className="room-body">
        {isCompact ? (
          <div className="compact-room">
            <nav className="compact-room-nav" aria-label="Room panels">
              <button className={compactPane === 'files' ? 'selected' : ''} onClick={() => setCompactPane('files')}>Files</button>
              <button className={compactPane === 'editor' ? 'selected' : ''} onClick={() => setCompactPane('editor')}>Editor</button>
              {showChat && <button className={compactPane === 'chat' ? 'selected' : ''} onClick={() => setCompactPane('chat')}>Chat</button>}
            </nav>
            <div className="compact-room-content">
              {compactPane === 'files' && <FileSidebar roomId={roomId} onFileSelected={() => setCompactPane('editor')} />}
              {compactPane === 'editor' && (
                <div className="editor-area">
                  <TabBar />
                  {activeFileId ? <Editor /> : (
                    <div className="editor-empty">
                      <FileText size={40} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
                      <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>No file open</p>
                      <button className="btn btn-ghost" style={{ marginTop: '12px' }} onClick={() => setCompactPane('files')}>Browse files</button>
                    </div>
                  )}
                </div>
              )}
              {compactPane === 'chat' && showChat && <Chat />}
            </div>
          </div>
        ) : (
          <PanelGroup orientation="horizontal" className="room-panels" style={{ height: '100%', width: '100%', overflow: 'hidden' }}>
            <Panel defaultSize="17%" minSize="180px" maxSize="30%">
              <FileSidebar roomId={roomId} />
            </Panel>
            <PanelResizeHandle />
            <Panel defaultSize={showChat ? '57%' : '83%'} minSize="300px">
              <div className="editor-area">
                <TabBar />
                {activeFileId ? (
                  <Editor />
                ) : (
                  <div className="editor-empty">
                    <FileText size={48} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
                    <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>No file open</p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
                      Select a file from the explorer or create a new one
                    </p>
                  </div>
                )}
              </div>
            </Panel>
            {showChat && (
              <>
                <PanelResizeHandle />
                <Panel defaultSize="26%" minSize="260px" maxSize="40%">
                  <div style={{ height: '100%', overflow: 'hidden' }}><Chat /></div>
                </Panel>
              </>
            )}
          </PanelGroup>
        )}
      </div>

      <style>{`
        .room-layout {
          display: flex;
          flex-direction: column;
          height: 100vh;
          height: 100dvh;
          width: 100%;
          min-width: 0;
          overflow: hidden;
          background: var(--bg-base);
        }

        /* Header */
        .room-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 clamp(12px, 2vw, 24px);
          height: 58px;
          background: rgba(22, 27, 34, 0.96);
          border-bottom: 1px solid var(--border-subtle);
          flex-shrink: 0;
          gap: 12px;
        }
        .room-header-left { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
        .room-header-logo {
          width: 28px; height: 28px; border-radius: var(--radius-md);
          background: var(--accent-primary-muted);
          border: 1px solid var(--accent-primary);
          display: flex; align-items: center; justify-content: center;
          color: var(--accent-primary-hover);
          text-decoration: none;
          flex-shrink: 0;
          transition: background var(--transition-fast), border-color var(--transition-fast);
        }
        .room-header-logo:hover { background: var(--accent-primary-muted); border-color: var(--accent-primary-hover); }
        .room-header-logo:focus-visible { outline: 2px solid var(--accent-primary-hover); outline-offset: 2px; }
        .room-breadcrumb { display: flex; align-items: center; gap: 7px; min-width: 0; }
        .room-breadcrumb-root { font-size: 13px; color: var(--text-muted); }
        .room-breadcrumb-name { font-size: 13px; font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .room-header-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
        .room-header-divider { width: 1px; height: 20px; background: var(--border-subtle); }

        /* Presence avatars */
        .room-presence { display: flex; align-items: center; gap: 4px; }
        .room-avatar {
          width: 26px; height: 26px;
          border-radius: 50%;
          border: 2px solid var(--bg-surface);
          display: flex; align-items: center; justify-content: center;
          font-size: 10px; font-weight: 700; color: white;
          position: relative;
        }
        .room-avatar-more { background: var(--bg-hover); color: var(--text-muted); font-size: 9px; }
        .room-presence-count { font-size: 12px; color: var(--text-muted); margin-left: 2px; }

        /* Identity + status */
        .room-identity {
          display: flex; align-items: center; gap: 6px;
          padding: 4px 10px; border-radius: var(--radius-full);
          background: var(--bg-elevated); border: 1px solid var(--border-subtle);
          font-size: 12px; font-weight: 500;
        }
        .room-identity-dot { width: 8px; height: 8px; border-radius: 50%; }
        .room-status {
          display: flex; align-items: center; gap: 5px;
          padding: 4px 10px; border-radius: var(--radius-full);
          font-size: 12px; font-weight: 500;
        }
        .room-status.synced { background: var(--accent-success-muted); color: var(--accent-success); }
        .room-status.connecting { background: var(--accent-warning-muted); color: var(--accent-warning); }

        /* Body */
        .room-body {
          flex: 1;
          overflow: hidden;
          display: flex;
          width: 100%;
          min-height: 0;
          min-width: 0;
          position: relative;
          padding: 12px 14px 14px;
        }
        .room-panels { border: 1px solid var(--border-default); border-radius: 12px; background: var(--bg-surface); overflow: hidden; box-shadow: 0 10px 30px rgba(1, 4, 9, 0.18); }
        .compact-room { display: flex; flex-direction: column; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; border: 1px solid var(--border-default); border-radius: 12px; background: var(--bg-surface); box-shadow: 0 10px 30px rgba(1, 4, 9, 0.18); }
        .compact-room-nav { display: flex; flex: 0 0 44px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-surface); }
        .compact-room-nav button { flex: 1; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--text-muted); font: inherit; font-size: 13px; cursor: pointer; }
        .compact-room-nav button.selected { border-bottom-color: var(--accent-primary); color: var(--accent-primary-hover); }
        .compact-room-content { flex: 1; min-width: 0; min-height: 0; overflow: hidden; }

        /* Sidebar */
        .sidebar {
          display: flex; flex-direction: column;
          height: 100%;
          background: var(--bg-surface);
          border-right: 1px solid var(--border-subtle);
          overflow: hidden;
          user-select: none;
          min-width: 0;
        }
        .sidebar-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 12px;
          border-bottom: 1px solid var(--border-subtle);
          flex-shrink: 0;
        }
        .sidebar-title {
          font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
          text-transform: uppercase; color: var(--text-muted);
        }
        .sidebar-body { flex: 1; overflow-y: auto; padding: 4px 0; }
        .sidebar-empty {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 32px 12px; color: var(--text-muted);
          font-size: 12px; text-align: center; gap: 6px;
        }
        .sidebar-create-form {
          display: flex; align-items: center; gap: 6px;
          padding: 4px 10px; margin: 2px 4px;
        }
        .sidebar-create-input {
          flex: 1; background: var(--bg-base);
          border: 1px solid var(--accent-primary);
          border-radius: 3px;
          color: var(--text-primary); font-size: 12px;
          padding: 3px 6px; outline: none; font-family: var(--font-mono);
        }
        .sidebar-file {
          display: flex; align-items: center; gap: 7px;
          padding: 5px 12px;
          cursor: pointer;
          font-size: 13px; color: var(--text-secondary);
          border-radius: 0;
          transition: all var(--transition-fast);
          border-left: 2px solid transparent;
        }
        .sidebar-file:hover { background: var(--bg-hover); color: var(--text-primary); }
        .sidebar-file.active {
          background: var(--bg-active);
          color: var(--accent-primary-hover);
          border-left-color: var(--accent-primary);
        }
        .sidebar-file.open { color: var(--text-primary); }
        .sidebar-file-icon { flex-shrink: 0; }
        .sidebar-file-name { font-family: var(--font-mono); font-size: 12px; }
        .sidebar-rename-input {
          flex: 1; background: var(--bg-base);
          border: 1px solid var(--accent-primary);
          border-radius: 3px; color: var(--text-primary);
          font-size: 12px; font-family: var(--font-mono);
          padding: 2px 4px; outline: none; min-width: 0;
        }

        /* Tab bar */
        .tabbar {
          display: flex; align-items: stretch; overflow-x: auto;
          background: var(--bg-surface);
          border-bottom: 1px solid var(--border-subtle);
          height: var(--tabbar-height);
          flex-shrink: 0;
        }
        .tabbar::-webkit-scrollbar { height: 3px; }
        .tab {
          display: flex; align-items: center; gap: 6px;
          padding: 0 12px;
          min-width: 100px; max-width: 180px;
          cursor: pointer;
          font-size: 12px; color: var(--text-muted);
          border-right: 1px solid var(--border-subtle);
          transition: background var(--transition-fast);
          flex-shrink: 0;
          border-bottom: 2px solid transparent;
        }
        .tab:hover { background: var(--bg-hover); color: var(--text-secondary); }
        .tab.active {
          background: var(--bg-base);
          color: var(--text-primary);
          border-bottom-color: var(--accent-primary);
        }
        .tab-icon { flex-shrink: 0; }
        .tab-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono); }
        .tab-close {
          padding: 2px; opacity: 0; transition: opacity var(--transition-fast);
          border-radius: 3px; flex-shrink: 0;
        }
        .tab:hover .tab-close, .tab.active .tab-close { opacity: 1; }

        /* Editor area */
        .editor-area {
          display: flex; flex-direction: column;
          height: 100%;
          background: var(--bg-base);
          overflow: hidden;
          min-width: 0;
        }
        .editor-empty {
          flex: 1;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          color: var(--text-muted);
        }

        @media (max-width: 900px) {
          .room-header { padding: 0 10px; gap: 8px; }
          .room-header-right { gap: 6px; }
          .room-presence-count, .room-header-divider, .room-identity { display: none; }
          .room-body { padding: 8px; }
        }
        @media (max-width: 680px) {
          .room-breadcrumb-root, .room-breadcrumb > svg { display: none; }
          .room-header-right .room-presence { display: none; }
          .room-status { padding: 4px 6px; }
          .room-status span { display: none; }
        }
      `}</style>
    </div>
  );
}

export function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { token } = useAuthStore();
  const [accessState, setAccessState] = useState<'checking' | 'allowed' | 'pending' | 'denied' | 'error'>('checking');
  const [accessMessage, setAccessMessage] = useState('Checking room permissions...');
  const navigate = useNavigate();

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    let timer: number | undefined;
    const checkAccess = async () => {
      try {
        const res = await fetch(`${API_URL}/api/rooms/${encodeURIComponent(roomId)}/access`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.allowed) {
          setAccessState('allowed');
          return;
        }
        if (data.status === 'PENDING') {
          setAccessState('pending');
          setAccessMessage(data.error || 'Waiting for the room owner to approve your request.');
          timer = window.setTimeout(() => { void checkAccess(); }, 5000);
        } else {
          setAccessState(res.status >= 500 ? 'error' : 'denied');
          setAccessMessage(data.error || 'You do not have access to this room.');
        }
      } catch {
        if (cancelled) return;
        setAccessState('error');
        setAccessMessage('Could not check room access. Check that the backend is running, then try again.');
      }
    };
    void checkAccess();
    return () => { cancelled = true; if (timer !== undefined) window.clearTimeout(timer); };
  }, [roomId, token]);

  if (!roomId) return <div style={{ color: 'var(--text-primary)', padding: '24px' }}>Invalid Room ID</div>;

  if (accessState !== 'allowed') {
    return (
      <div className="join-page">
        <div className="join-card glass-card">
          {accessState === 'checking' ? <Loader2 className="animate-spin" size={32} /> : <Code2 size={32} />}
          <h2>{accessState === 'pending' ? 'Approval pending' : accessState === 'checking' ? 'Checking access' : 'Room unavailable'}</h2>
          <p>{accessMessage}</p>
          <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>Back to dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <RoomProvider roomName={roomId}>
      <RoomContent roomId={roomId} />
    </RoomProvider>
  );
}
