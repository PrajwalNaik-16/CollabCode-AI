import { useState, useEffect, useRef, type FormEvent } from 'react';
import * as Y from 'yjs';
import { useRoom } from '../contexts/roomContextValue';
import { useStore } from '../store';
import { Send, MessageSquare } from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: string;
  color: string;
  text: string;
  timestamp: number;
}

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function Chat() {
  const { ydoc, provider } = useRoom();
  const { profile } = useStore();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatArrayRef = useRef<Y.Array<ChatMessage> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ydoc || !provider) return;

    // Chat is room-wide (not per-file), so use a fixed key
    const chatArray = ydoc.getArray<ChatMessage>('room:chat');
    chatArrayRef.current = chatArray;

    const observeChat = () => setMessages(chatArray.toArray());
    chatArray.observe(observeChat);
    setMessages(chatArray.toArray());

    const observeAwareness = () => {
      const states = Array.from(provider.awareness.getStates().values());
      const typing = states
        .filter((s: Record<string, any>) => s.isTyping && s.user?.name !== profile.name)
        .map((s: Record<string, any>) => s.user.name as string);
      setTypingUsers([...new Set(typing)]);
    };
    provider.awareness.on('change', observeAwareness);

    return () => {
      chatArray.unobserve(observeChat);
      provider.awareness.off('change', observeAwareness);
    };
  }, [ydoc, provider, profile.name]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    if (provider) {
      provider.awareness.setLocalStateField('isTyping', true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        provider.awareness.setLocalStateField('isTyping', false);
      }, 2000);
    }
  };

  const handleSend = (e: FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !chatArrayRef.current) return;

    chatArrayRef.current.push([{
      id: crypto.randomUUID(),
      sender: profile.name,
      color: profile.color,
      text: inputText.trim(),
      timestamp: Date.now(),
    }]);

    setInputText('');
    if (provider) {
      provider.awareness.setLocalStateField('isTyping', false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    }
  };

  if (!ydoc) {
    return <div className="chat-root chat-loading" />;
  }

  return (
    <div className="chat-root">
      {/* Header */}
      <div className="chat-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MessageSquare size={14} style={{ color: 'var(--accent-primary-hover)' }} />
          <span style={{ fontWeight: 600, fontSize: '13px' }}>Team Chat</span>
        </div>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{messages.length} msgs</span>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <MessageSquare size={28} />
            <p>No messages yet</p>
            <span>Say hello to your teammates!</span>
          </div>
        )}

        {messages.map((msg, i) => {
          const isMe = msg.sender === profile.name;
          const prevMsg = messages[i - 1];
          const showSender = !prevMsg || prevMsg.sender !== msg.sender;

          return (
            <div key={msg.id} className={`chat-msg ${isMe ? 'chat-msg-me' : 'chat-msg-other'}`}>
              {!isMe && showSender && (
                <div className="chat-msg-meta">
                  <div
                    className="chat-msg-avatar"
                    style={{ background: msg.color }}
                    title={msg.sender}
                  >
                    {msg.sender.charAt(0).toUpperCase()}
                  </div>
                  <span className="chat-msg-sender">{msg.sender}</span>
                  <span className="chat-msg-time">{formatTime(msg.timestamp)}</span>
                </div>
              )}
              <div
                className="chat-bubble"
                style={isMe
                  ? { background: msg.color, color: '#fff', alignSelf: 'flex-end' }
                  : { borderLeft: `3px solid ${msg.color}` }
                }
              >
                {msg.text}
              </div>
              {isMe && (
                <span className="chat-msg-time" style={{ alignSelf: 'flex-end', marginTop: '2px' }}>
                  {formatTime(msg.timestamp)}
                </span>
              )}
            </div>
          );
        })}

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="chat-typing">
            <div className="typing-dots">
              <span /><span /><span />
            </div>
            <span>{typingUsers.join(', ')} {typingUsers.length > 1 ? 'are' : 'is'} typing...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-input-area">
        <form onSubmit={handleSend} className="chat-input-form">
          <input
            type="text"
            value={inputText}
            onChange={handleInputChange}
            placeholder="Message your team..."
            className="chat-input"
          />
          <button
            type="submit"
            className="btn btn-primary chat-send-btn"
            disabled={!inputText.trim()}
            style={{ padding: '8px', flexShrink: 0 }}
          >
            <Send size={14} />
          </button>
        </form>
      </div>

      <style>{`
        .chat-root {
          display: flex; flex-direction: column;
          height: 100%;
          background: var(--bg-surface);
          border-left: 1px solid var(--border-subtle);
          overflow: hidden;
        }
        .chat-loading { background: var(--bg-surface); }
        .chat-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 14px;
          border-bottom: 1px solid var(--border-subtle);
          flex-shrink: 0;
        }
        .chat-messages {
          flex: 1; overflow-y: auto;
          padding: 12px;
          display: flex; flex-direction: column; gap: 4px;
        }
        .chat-empty {
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 6px; flex: 1;
          color: var(--text-muted); font-size: 12px; text-align: center;
          padding: 32px 12px;
        }
        .chat-empty p { font-weight: 600; color: var(--text-secondary); font-size: 13px; }
        .chat-msg { display: flex; flex-direction: column; gap: 2px; }
        .chat-msg-me { align-items: flex-end; }
        .chat-msg-other { align-items: flex-start; }
        .chat-msg-meta { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
        .chat-msg-avatar {
          width: 18px; height: 18px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 9px; font-weight: 700; color: white; flex-shrink: 0;
        }
        .chat-msg-sender { font-size: 11px; font-weight: 600; color: var(--text-secondary); }
        .chat-msg-time { font-size: 10px; color: var(--text-muted); }
        .chat-bubble {
          max-width: 85%;
          padding: 7px 11px;
          border-radius: 10px;
          font-size: 13px; line-height: 1.45;
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          color: var(--text-primary);
          word-break: break-word;
        }
        .chat-msg-me .chat-bubble { border-color: transparent; }

        .chat-typing {
          display: flex; align-items: center; gap: 8px;
          color: var(--text-muted); font-size: 11px; padding: 4px 0;
        }
        .typing-dots { display: flex; gap: 3px; }
        .typing-dots span {
          width: 5px; height: 5px; border-radius: 50%;
          background: var(--text-muted);
          animation: pulse-dot 1.2s ease-in-out infinite;
        }
        .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
        .typing-dots span:nth-child(3) { animation-delay: 0.4s; }

        .chat-input-area {
          padding: 10px 12px;
          border-top: 1px solid var(--border-subtle);
          background: var(--bg-surface);
          flex-shrink: 0;
        }
        .chat-input-form { display: flex; gap: 6px; }
        .chat-input {
          flex: 1;
          background: var(--bg-base);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-full);
          color: var(--text-primary);
          font-family: var(--font-sans);
          font-size: 13px;
          padding: 8px 14px;
          outline: none;
          transition: border-color var(--transition-fast);
        }
        .chat-input::placeholder { color: var(--text-muted); }
        .chat-input:focus { border-color: var(--accent-primary); }
        .chat-send-btn { border-radius: var(--radius-full) !important; }
      `}</style>
    </div>
  );
}
