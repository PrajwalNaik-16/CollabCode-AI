import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { API_URL } from '../config';
import { Code2, Sparkles, Eye, EyeOff, Loader2 } from 'lucide-react';

export function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    const body = isLogin ? { email, password } : { email, password, name };

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');
      setAuth(data.token, data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Animated background orbs */}
      <div className="auth-bg">
        <div className="auth-orb auth-orb-1" />
        <div className="auth-orb auth-orb-2" />
        <div className="auth-orb auth-orb-3" />
      </div>

      <div className="auth-card glass-card animate-fade-in">
        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <Code2 size={24} />
          </div>
          <h1 className="auth-logo-title gradient-text">CollabEditor</h1>
        </div>

        <p className="auth-subtitle">
          {isLogin ? 'Sign in to your workspace' : 'Create your account and start collaborating'}
        </p>

        {/* Feature pills */}
        <div className="auth-features">
          {['Real-time Sync', 'Multi-cursor', 'AI Assist'].map(f => (
            <span key={f} className="auth-feature-pill">
              <Sparkles size={10} />
              {f}
            </span>
          ))}
        </div>

        {error && (
          <div className="auth-error animate-fade-in">
            <span>⚠</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          {!isLogin && (
            <div className="auth-field animate-fade-in">
              <label className="auth-label">Display Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="input"
                placeholder="Alex Developer"
              />
            </div>
          )}

          <div className="auth-field">
            <label className="auth-label">Email address</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input"
              placeholder="you@example.com"
            />
          </div>

          <div className="auth-field">
            <label className="auth-label">Password</label>
            <div className="auth-password-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input"
                placeholder="••••••••"
                style={{ paddingRight: '42px' }}
              />
              <button
                type="button"
                className="auth-password-toggle btn-icon"
                onClick={() => setShowPassword(v => !v)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="auth-switch">
          <span>{isLogin ? "Don't have an account?" : 'Already have an account?'}</span>
          <button
            className="auth-switch-btn"
            onClick={() => { setIsLogin(v => !v); setError(''); }}
          >
            {isLogin ? 'Sign up free' : 'Sign in'}
          </button>
        </div>
      </div>

      <style>{`
        .auth-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-base);
          padding: 24px;
          position: relative;
          overflow: hidden;
        }
        .auth-bg { position: absolute; inset: 0; pointer-events: none; }
        .auth-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.18;
        }
        .auth-orb-1 {
          width: 500px; height: 500px;
          background: radial-gradient(circle, #388bfd, transparent);
          top: -100px; left: -100px;
          animation: float1 8s ease-in-out infinite;
        }
        .auth-orb-2 {
          width: 400px; height: 400px;
          background: radial-gradient(circle, #d2a8ff, transparent);
          bottom: -80px; right: -80px;
          animation: float2 10s ease-in-out infinite;
        }
        .auth-orb-3 {
          width: 300px; height: 300px;
          background: radial-gradient(circle, #3fb950, transparent);
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          animation: float1 12s ease-in-out infinite reverse;
        }
        @keyframes float1 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(30px, -30px); }
        }
        @keyframes float2 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-25px, 25px); }
        }
        .auth-card {
          width: 100%;
          max-width: 420px;
          border-radius: var(--radius-xl);
          padding: 36px 32px;
          position: relative;
          z-index: 1;
        }
        .auth-logo {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 8px;
        }
        .auth-logo-icon {
          width: 44px; height: 44px;
          border-radius: var(--radius-lg);
          background: var(--accent-primary-muted);
          border: 1px solid var(--accent-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent-primary-hover);
          box-shadow: var(--shadow-glow-accent);
        }
        .auth-logo-title {
          font-size: 26px;
          font-weight: 800;
          letter-spacing: -0.5px;
        }
        .auth-subtitle {
          color: var(--text-muted);
          font-size: 13px;
          margin-bottom: 16px;
        }
        .auth-features {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 24px;
        }
        .auth-feature-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 10px;
          border-radius: var(--radius-full);
          background: var(--bg-elevated);
          border: 1px solid var(--border-default);
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 500;
        }
        .auth-error {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          background: var(--accent-danger-muted);
          border: 1px solid var(--accent-danger);
          border-radius: var(--radius-md);
          color: var(--accent-danger);
          font-size: 13px;
          margin-bottom: 16px;
        }
        .auth-form { display: flex; flex-direction: column; gap: 16px; }
        .auth-field { display: flex; flex-direction: column; gap: 6px; }
        .auth-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); letter-spacing: 0.02em; }
        .auth-password-wrap { position: relative; }
        .auth-password-toggle {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 4px;
        }
        .auth-submit { justify-content: center; padding: 10px; font-size: 14px; margin-top: 4px; }
        .auth-switch {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          margin-top: 20px;
          font-size: 13px;
          color: var(--text-muted);
        }
        .auth-switch-btn {
          background: none;
          border: none;
          color: var(--accent-primary-hover);
          font-weight: 600;
          cursor: pointer;
          font-size: 13px;
          font-family: var(--font-sans);
        }
        .auth-switch-btn:hover { text-decoration: underline; }
      `}</style>
    </div>
  );
}
