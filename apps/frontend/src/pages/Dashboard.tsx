import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { API_URL } from '../config';
import {
  LogOut, Plus, UserPlus, Users, Code2, Loader2,
  Clock, Copy, Check, ExternalLink, Crown,
  X, Trash2,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import './Dashboard.css';


interface User { id: string; name: string; email: string; }
interface Room {
  id: string; name: string; createdAt: string;
  owner: User;
  participants: { user: User }[];
}
interface RoomJoinRequest {
  id: string;
  role: 'EDITOR' | 'VIEWER';
  createdAt: string;
  user: User;
  room: { id: string; name: string };
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function Dashboard() {
  const { user, logout, token } = useAuthStore();
  const navigate = useNavigate();

  const [friends, setFriends] = useState<User[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomJoinRequests, setRoomJoinRequests] = useState<RoomJoinRequest[]>([]);
  const [joinRequestsError, setJoinRequestsError] = useState('');
  const [loading, setLoading] = useState(true);

  const [friendEmail, setFriendEmail] = useState('');
  const [roomName, setRoomName] = useState('');
  const [error, setError] = useState('');
  const [friendError, setFriendError] = useState('');
  const [copiedRoomId, setCopiedRoomId] = useState<string | null>(null);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);

  const headers = { Authorization: `Bearer ${token}` };

  const fetchDashboardData = useCallback(async () => {
    try {
      const [friendsRes, requestsRes, roomsRes, roomJoinRequestsRes] = await Promise.all([
        fetch(`${API_URL}/api/friends`, { headers }),
        fetch(`${API_URL}/api/friends/requests`, { headers }),
        fetch(`${API_URL}/api/rooms`, { headers }),
        fetch(`${API_URL}/api/rooms/join-requests`, { headers }),
      ]);
      if (friendsRes.ok) setFriends(await friendsRes.json());
      if (requestsRes.ok) setRequests(await requestsRes.json());
      if (roomsRes.ok) setRooms(await roomsRes.json());
      if (roomJoinRequestsRes.ok) {
        setRoomJoinRequests(await roomJoinRequestsRes.json());
        setJoinRequestsError('');
      } else {
        const data = await roomJoinRequestsRes.json().catch(() => ({}));
        setJoinRequestsError(data.error || `Could not load join requests (${roomJoinRequestsRes.status})`);
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchDashboardData();
    const refreshTimer = window.setInterval(() => { void fetchDashboardData(); }, 5000);
    return () => window.clearInterval(refreshTimer);
  }, [fetchDashboardData]);

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    setFriendError('');
    try {
      const res = await fetch(`${API_URL}/api/friends/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ email: friendEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFriendEmail('');
      // Show success inline instead of alert
      setFriendError('✓ Request sent!');
      setTimeout(() => setFriendError(''), 3000);
    } catch (err: any) { setFriendError(err.message); }
  };

  const handleAcceptRequest = async (requestId: string) => {
    await fetch(`${API_URL}/api/friends/accept/${requestId}`, {
      method: 'POST',
      headers,
    });
    fetchDashboardData();
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCreatingRoom(true);
    try {
      const res = await fetch(`${API_URL}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ name: roomName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRoomName('');
      navigate(`/room/${data.name}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreatingRoom(false);
    }
  };

  const handleInvite = async (roomId: string, friendId: string) => {
    await fetch(`${API_URL}/api/rooms/${roomId}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ friendId }),
    });
    fetchDashboardData();
  };

  const handleDeleteRoom = async (room: Room) => {
    if (!window.confirm(`Delete room "${room.name}"? This permanently deletes its files and removes access for all members.`)) return;
    setError('');
    setDeletingRoomId(room.id);
    try {
      const res = await fetch(`${API_URL}/api/rooms/${room.id}`, { method: 'DELETE', headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not delete room');
      await fetchDashboardData();
    } catch (err: any) {
      setError(err.message || 'Could not delete room');
    } finally {
      setDeletingRoomId(null);
    }
  };

  const reviewRoomJoinRequest = async (requestId: string, status: 'ACCEPTED' | 'DENIED') => {
    try {
      const res = await fetch(`${API_URL}/api/rooms/join-requests/${requestId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not review join request');
      await fetchDashboardData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const copyRoomLink = async (roomName: string, roomId: string, isOwner: boolean) => {
    try {
      let link = `${window.location.origin}/room/${roomName}`;
      if (isOwner) {
        const res = await fetch(`${API_URL}/api/rooms/${roomId}/invite-link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ role: 'EDITOR', expiresIn: '7d' }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not create invite link');
        link = `${window.location.origin}/join/${data.token}`;
      }
      await navigator.clipboard.writeText(link);
      setCopiedRoomId(roomId);
      setTimeout(() => setCopiedRoomId(null), 2000);
    } catch (err: any) {
      setError(err.message || 'Could not copy room link');
    }
  };

  const myRooms = rooms.filter(r => r.owner?.id === user?.id);
  const sharedRooms = rooms.filter(r => r.owner?.id !== user?.id);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-base)', gap: '12px', color: 'var(--text-secondary)' }}>
        <Loader2 size={20} className="animate-spin" />
        <span>Loading your workspace...</span>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dash-header">
        <Link to="/dashboard" className="dash-header-left dash-brand" aria-label="CollabCode AI dashboard">
          <div className="dash-logo">
            <Code2 size={20} />
          </div>
          <span className="dash-logo-text">CollabCode AI</span>
        </Link>
        <div className="dash-header-right">
          <div className="dash-user-chip">
            <div className="dash-avatar">{user?.name?.charAt(0).toUpperCase()}</div>
            <span>{user?.name}</span>
          </div>
          <button className="btn btn-ghost" onClick={logout} style={{ gap: '6px', fontSize: '12px' }}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </header>

      <main className="dash-main">
        {/* Page Title */}
        <div className="dash-page-title">
          <div>
            <p className="dash-eyebrow">COLLABORATION WORKSPACE</p>
            <h1>Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}</h1>
            <p className="dash-page-subtitle">Pick up where your team left off, or start a new coding session.</p>
          </div>
          <div className="dash-overview" aria-label="Workspace overview">
            <span><strong>{rooms.length}</strong> {rooms.length === 1 ? 'room' : 'rooms'}</span>
            <span><strong>{friends.length}</strong> {friends.length === 1 ? 'collaborator' : 'collaborators'}</span>
          </div>
        </div>

        <div className="dash-grid">
          {/* ── Left: Rooms ── */}
          <div className="dash-col-main">
            {/* Create room */}
            <div className="dash-section dash-create-section">
              <div className="dash-section-header">
                <div className="dash-section-title">
                  <div className="dash-section-icon"><Code2 size={17} /></div>
                  <div>
                    <span>Start a coding session</span>
                    <p className="dash-section-description">Create a shared workspace and invite your collaborators.</p>
                  </div>
                </div>
              </div>
              <form onSubmit={handleCreateRoom} className="dash-create-form">
                <input
                  className="input"
                  value={roomName}
                  onChange={e => setRoomName(e.target.value)}
                  placeholder="my-awesome-project"
                  required
                />
                <button type="submit" className="btn btn-primary" disabled={creatingRoom}>
                  {creatingRoom ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  {creatingRoom ? 'Creating...' : 'New Room'}
                </button>
              </form>
              {error && <p className="dash-error">{error}</p>}
            </div>

            {(roomJoinRequests.length > 0 || joinRequestsError) && <div className="dash-section dash-inbox-section">
              <p className="dash-section-label">
                <UserPlus size={12} /> Room access requests ({roomJoinRequests.length})
              </p>
              {joinRequestsError ? <p className="dash-error">{joinRequestsError}</p> : roomJoinRequests.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>No pending requests for your rooms.</p>
              ) : (
                <div className="dash-room-list">
                  {roomJoinRequests.map(request => (
                    <div key={request.id} className="dash-request-item">
                      <div className="dash-avatar" style={{ width: '32px', height: '32px', fontSize: '12px' }}>
                        {request.user.name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '13px', fontWeight: 600 }}>{request.user.name}</p>
                        <p style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                          wants to join <strong>{request.room.name}</strong> as {request.role.toLowerCase()}
                        </p>
                      </div>
                      <button className="btn btn-success" style={{ padding: '5px 9px', fontSize: '11px' }}
                        onClick={() => reviewRoomJoinRequest(request.id, 'ACCEPTED')} title="Approve request">
                        <Check size={13} /> Approve
                      </button>
                      <button className="btn btn-ghost" style={{ padding: '5px 9px', fontSize: '11px', color: 'var(--accent-danger)' }}
                        onClick={() => reviewRoomJoinRequest(request.id, 'DENIED')} title="Deny request">
                        <X size={13} /> Deny
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>}

            {/* My Rooms */}
            {myRooms.length > 0 && (
              <div className="dash-section">
                <p className="dash-section-label"><Crown size={12} /> My Rooms</p>
                <div className="dash-room-list">
                  {myRooms.map(room => (
                    <RoomCard
                      key={room.id}
                      room={room}
                      isOwner
                      friends={friends}
                      userId={user?.id}
                      copied={copiedRoomId === room.id}
                      onEnter={() => navigate(`/room/${room.name}`)}
                      onInvite={fid => handleInvite(room.id, fid)}
                      onCopy={() => copyRoomLink(room.name, room.id, true)}
                      onDelete={() => void handleDeleteRoom(room)}
                      deleting={deletingRoomId === room.id}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Shared with me */}
            {sharedRooms.length > 0 && (
              <div className="dash-section">
                <p className="dash-section-label"><Users size={12} /> Shared with Me</p>
                <div className="dash-room-list">
                  {sharedRooms.map(room => (
                    <RoomCard
                      key={room.id}
                      room={room}
                      isOwner={false}
                      friends={friends}
                      userId={user?.id}
                      copied={copiedRoomId === room.id}
                      onEnter={() => navigate(`/room/${room.name}`)}
                      onInvite={fid => handleInvite(room.id, fid)}
                      onCopy={() => copyRoomLink(room.name, room.id, false)}
                    />
                  ))}
                </div>
              </div>
            )}

            {rooms.length === 0 && (
              <div className="dash-empty">
                <Code2 size={40} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
                <p>No rooms yet. Create one to start collaborating!</p>
              </div>
            )}
          </div>

          {/* ── Right: Friends ── */}
          <div className="dash-col-side">
            <div className="dash-section">
              <div className="dash-section-header">
                <div className="dash-section-title">
                  <Users size={16} />
                  <span>Team</span>
                  {friends.length > 0 && <span className="badge badge-accent">{friends.length}</span>}
                </div>
              </div>

              {/* Add friend */}
              <form onSubmit={handleAddFriend} className="dash-add-friend">
                <input
                  className="input"
                  type="email"
                  value={friendEmail}
                  onChange={e => setFriendEmail(e.target.value)}
                  placeholder="colleague@email.com"
                />
                <button type="submit" className="btn btn-ghost btn-icon" title="Send friend request">
                  <UserPlus size={15} />
                </button>
              </form>
              {friendError && (
                <p style={{ fontSize: '12px', marginTop: '6px', color: friendError.startsWith('✓') ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                  {friendError}
                </p>
              )}

              {/* Pending requests */}
              {requests.length > 0 && (
                <div className="dash-requests">
                  <p className="dash-section-label">Pending Requests</p>
                  {requests.map(req => (
                    <div key={req.id} className="dash-request-item">
                      <div className="dash-avatar" style={{ width: '28px', height: '28px', fontSize: '11px' }}>
                        {req.user1?.name?.charAt(0)}
                      </div>
                      <span style={{ flex: 1, fontSize: '13px' }}>{req.user1?.name}</span>
                      <button
                        className="btn btn-success"
                        style={{ padding: '3px 10px', fontSize: '11px' }}
                        onClick={() => handleAcceptRequest(req.id)}
                      >
                        Accept
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Friends list */}
              <div className="dash-friends-list">
                {friends.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
                    No teammates yet. Invite someone!
                  </p>
                ) : (
                  friends.map(f => (
                    <div key={f.id} className="dash-friend-item">
                      <div className="dash-avatar">{f.name.charAt(0).toUpperCase()}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }} className="truncate">{f.name}</p>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)' }} className="truncate">{f.email}</p>
                      </div>
                      <div className="friend-online-dot" title="Online" />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

    </div>
  );
}

/* ─── Room Card ─────────────────────────────────────────────────── */
function RoomCard({
  room, isOwner, friends, userId, copied, onEnter, onInvite, onCopy, onDelete, deleting,
}: {
  room: Room; isOwner: boolean; friends: User[]; userId?: string;
  copied: boolean; onEnter: () => void; onInvite: (id: string) => void; onCopy: () => void;
  onDelete?: () => void; deleting?: boolean;
}) {
  const uninvitedFriends = friends.filter(
    f => !room.participants.some(p => p.user.id === f.id) && f.id !== userId,
  );

  return (
    <div className="room-card">
      <div className="room-card-info">
        <div className="room-card-icon">
          <Code2 size={16} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h3 className="room-card-name">{room.name}</h3>
            {isOwner && <span className="badge badge-accent" style={{ fontSize: '10px' }}>Owner</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '3px' }}>
            <span className="room-card-meta">
              <Users size={11} /> {room.participants.length + 1} members
            </span>
            <span className="room-card-meta">
              <Clock size={11} /> {timeAgo(room.createdAt)}
            </span>
          </div>
        </div>
      </div>

      <div className="room-card-actions">
        {isOwner && uninvitedFriends.length > 0 && (
          <select
            className="room-invite-select"
            onChange={e => { if (e.target.value) { onInvite(e.target.value); e.target.value = ''; } }}
          >
            <option value="">Invite...</option>
            {uninvitedFriends.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        )}

        <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: '12px' }} onClick={onCopy} title="Copy room link">
          {copied ? <Check size={13} style={{ color: 'var(--accent-success)' }} /> : <Copy size={13} />}
        </button>

        {isOwner && onDelete && (
          <button className="btn btn-ghost" style={{ padding: '6px 8px', color: 'var(--accent-danger)' }}
            onClick={onDelete} disabled={deleting} title="Delete room" aria-label={`Delete room ${room.name}`}>
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        )}

        <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '12px' }} onClick={onEnter}>
          <ExternalLink size={13} /> Open
        </button>
      </div>

    </div>
  );
}
