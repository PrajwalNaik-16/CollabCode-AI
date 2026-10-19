import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { API_URL } from '../config';
import { Loader2, CheckCircle, XCircle, Code2, Clock } from 'lucide-react';


export function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { token: authToken, isAuthenticated } = useAuthStore();

  const [status, setStatus] = useState<'loading' | 'pending' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [roomName, setRoomName] = useState('');

  useEffect(() => {
    if (!isAuthenticated) {
      // Redirect to login, then come back
      navigate(`/login?redirect=/join/${token}`);
      return;
    }
    if (!token) {
      setStatus('error');
      setMessage('Invalid invite link.');
      return;
    }

    let cancelled = false;
    let pollTimer: number | undefined;
    let redirectTimer: number | undefined;

    const goToRoomSoon = (name: string) => {
      if (cancelled) return;
      redirectTimer = window.setTimeout(() => navigate(`/room/${name}`), 1500);
    };

    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/rooms/join/${token}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to join room');
        setRoomName(data.roomName);
        if (data.status === 'PENDING') {
          setStatus('pending');
          const checkRequest = async () => {
            try {
              const statusRes = await fetch(`${API_URL}/api/rooms/join-requests/${data.requestId}`, {
                headers: { Authorization: `Bearer ${authToken}` },
              });
              if (!statusRes.ok) return;
              const requestState = await statusRes.json();
              if (cancelled) return;
              if (requestState.status === 'ACCEPTED') {
                window.clearInterval(pollTimer);
                setStatus('success');
                goToRoomSoon(requestState.roomName);
              } else if (requestState.status === 'DENIED') {
                window.clearInterval(pollTimer);
                setMessage('The room owner denied your request.');
                setStatus('error');
              }
            } catch {
              // Keep waiting if the server is temporarily unavailable.
            }
          };
          pollTimer = window.setInterval(() => { void checkRequest(); }, 5000);
          return;
        }
        setStatus('success');
        // Auto-redirect after 1.5s
        goToRoomSoon(data.roomName);
      } catch (err: any) {
        if (cancelled) return;
        setStatus('error');
        setMessage(err.message);
      }
    })();

    return () => {
      cancelled = true;
      if (pollTimer !== undefined) window.clearInterval(pollTimer);
      if (redirectTimer !== undefined) window.clearTimeout(redirectTimer);
    };
  }, [token, authToken, isAuthenticated, navigate]);

  return (
    <div className="join-page">
      <div className="join-card glass-card animate-fade-in">
        <div className="join-logo">
          <Code2 size={22} />
        </div>

        {status === 'loading' && (
          <>
            <Loader2 size={36} className="animate-spin join-icon" style={{ color: 'var(--accent-primary-hover)' }} />
            <h2 className="join-title">Joining room...</h2>
            <p className="join-sub">Verifying your invite link</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle size={36} className="join-icon" style={{ color: 'var(--accent-success)' }} />
            <h2 className="join-title">You're in!</h2>
            <p className="join-sub">Redirecting to <strong>{roomName}</strong>...</p>
            <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => navigate(`/room/${roomName}`)}>
              Go to Room Now
            </button>
          </>
        )}

        {status === 'pending' && (
          <>
            <Clock size={36} className="join-icon" style={{ color: 'var(--accent-warning)' }} />
            <h2 className="join-title">Request sent</h2>
            <p className="join-sub">The owner of <strong>{roomName}</strong> needs to approve your request. You can return to your dashboard while you wait.</p>
            <button className="btn btn-ghost" style={{ marginTop: '16px' }} onClick={() => navigate('/dashboard')}>
              Go to Dashboard
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle size={36} className="join-icon" style={{ color: 'var(--accent-danger)' }} />
            <h2 className="join-title">Invite Failed</h2>
            <p className="join-sub">{message}</p>
            <button className="btn btn-ghost" style={{ marginTop: '16px' }} onClick={() => navigate('/dashboard')}>
              Go to Dashboard
            </button>
          </>
        )}
      </div>

      <style>{`
        .join-page {
          min-height: 100vh;
          display: flex; align-items: center; justify-content: center;
          background: var(--bg-base);
          padding: 24px;
        }
        .join-card {
          width: 100%; max-width: 360px;
          border-radius: var(--radius-xl);
          padding: 40px 32px;
          display: flex; flex-direction: column; align-items: center; text-align: center;
          gap: 12px;
        }
        .join-logo {
          width: 48px; height: 48px;
          border-radius: var(--radius-lg);
          background: var(--accent-primary-muted);
          border: 1px solid var(--accent-primary);
          display: flex; align-items: center; justify-content: center;
          color: var(--accent-primary-hover);
          margin-bottom: 8px;
        }
        .join-icon { margin-bottom: 4px; }
        .join-title { font-size: 20px; font-weight: 700; }
        .join-sub { font-size: 13px; color: var(--text-muted); }
        .join-sub strong { color: var(--text-primary); }
      `}</style>
    </div>
  );
}
