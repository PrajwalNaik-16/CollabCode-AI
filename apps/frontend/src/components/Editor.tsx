import { useEffect, useRef, useState } from 'react';
import MonacoEditor, { type OnMount, type Monaco } from '@monaco-editor/react';
import { MonacoBinding } from 'y-monaco';
import { useRoom } from '../contexts/roomContextValue';
import { editor as MonacoEditorNS } from 'monaco-editor';
import { useStore } from '../store';
import { API_URL } from '../config';
import { executeCode, getLanguageFromExtension } from '../utils/executeCode';
import {
  Play, Terminal as TerminalIcon, X, Loader2, Download,
  Sparkles, Send, ChevronDown, ChevronUp,
} from 'lucide-react';

import { useAuthStore } from '../store/authStore';

// ─── AI Panel ────────────────────────────────────────────────────
function AIPanel({ code, language, onClose }: {
  code: string; language: string; onClose: () => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const token = useAuthStore.getState().token;

  const ask = async (question: string) => {
    if (!question.trim()) return;
    setLoading(true);
    setResponse('');
    try {
      const res = await fetch(`${API_URL}/api/ai/explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code, language, question }),
      });
      const data = await res.json();
      setResponse(data.answer || data.error || 'No response.');
    } catch {
      setResponse('AI service unavailable. Add your GEMINI_API_KEY to the backend .env to enable.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ai-panel">
      <div className="ai-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Sparkles size={14} style={{ color: 'var(--accent-primary-hover)' }} />
          <span style={{ fontWeight: 600, fontSize: '13px' }}>AI Assistant</span>
        </div>
        <button className="btn-icon" onClick={onClose}><X size={14} /></button>
      </div>

      <div className="ai-panel-quick-actions">
        {['Explain this code', 'Find bugs', 'Optimize performance', 'Add comments'].map(q => (
          <button key={q} className="ai-quick-btn" onClick={() => { setPrompt(q); ask(q); }}>
            {q}
          </button>
        ))}
      </div>

      {response && (
        <div className="ai-response">
          <pre>{response}</pre>
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
          <Loader2 size={14} className="animate-spin" /> Thinking...
        </div>
      )}

      <form
        className="ai-input-row"
        onSubmit={e => { e.preventDefault(); ask(prompt); setPrompt(''); }}
      >
        <input
          className="input"
          style={{ fontSize: '12px', padding: '7px 10px' }}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Ask about this code..."
        />
        <button type="submit" className="btn btn-primary" style={{ padding: '7px 12px' }} disabled={loading || !prompt.trim()}>
          <Send size={13} />
        </button>
      </form>
    </div>
  );
}

// ─── Editor ───────────────────────────────────────────────────────
export function Editor() {
  const { ydoc, provider } = useRoom();
  const { activeFileId, files } = useStore();
  const editorRef = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);

  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(200);
  const [isRunning, setIsRunning] = useState(false);
  const [output, setOutput] = useState('');
  const [showAI, setShowAI] = useState(false);

  const activeFile = files.find(f => f.id === activeFileId);
  const fileName = activeFile?.name || 'untitled';
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const language =
    getLanguageFromExtension(fileName) ||
    (['ts', 'tsx'].includes(ext) ? 'typescript' : ext === 'py' ? 'python' : 'javascript');

  const handleEditorMount: OnMount = (editorInstance, monaco) => {
    editorRef.current = editorInstance;
    monacoRef.current = monaco;
    bindEditor(editorInstance);
  };

  const bindEditor = (editorInstance: MonacoEditorNS.IStandaloneCodeEditor) => {
    if (!ydoc || !provider) return;
    bindingRef.current?.destroy();

    // KEY FIX: each file uses a unique Yjs text — keyed by activeFileId
    const yText = ydoc.getText(`file:${activeFileId}`);
    bindingRef.current = new MonacoBinding(
      yText,
      editorInstance.getModel()!,
      new Set([editorInstance]),
      provider.awareness,
    );
  };

  // Track remote cursor decorations
  const decorationsRef = useRef<MonacoEditorNS.IEditorDecorationsCollection | null>(null);

  const updateRemoteCursors = () => {
    if (!provider || !editorRef.current || !monacoRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;

    const decorations: MonacoEditorNS.IModelDeltaDecoration[] = [];
    const states = Array.from(provider.awareness.getStates().entries());

    for (const [clientId, state] of states) {
      if (clientId === provider.awareness.clientID) continue; // skip self
      const user = (state as any).user;
      if (!user) continue;

      // y-monaco stores cursor as { anchor, head } in awareness
      const cursor = (state as any).cursor;
      if (!cursor) continue;

      try {
        const anchorPos = monacoRef.current.editor
          .getModel(model.uri)!
          .getPositionAt(cursor.anchor);
        const headPos = monacoRef.current.editor
          .getModel(model.uri)!
          .getPositionAt(cursor.head);

        // Cursor line decoration
        decorations.push({
          range: new monacoRef.current.Range(
            anchorPos.lineNumber, anchorPos.column,
            headPos.lineNumber, headPos.column,
          ),
          options: {
            className: `remote-cursor-selection`,
            inlineClassName: `remote-cursor-caret`,
            // Use after content for the name label
            afterContentClassName: `remote-cursor-label`,
            stickiness: monacoRef.current.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          },
        });
      } catch { /* position out of range */ }
    }

    if (!decorationsRef.current) {
      decorationsRef.current = editorRef.current.createDecorationsCollection(decorations);
    } else {
      decorationsRef.current.set(decorations);
    }
  };

  useEffect(() => {
    if (ydoc && provider && editorRef.current) {
      bindEditor(editorRef.current);
    }

    // Update remote cursors when awareness changes
    const onAwarenessChange = () => updateRemoteCursors();
    provider?.awareness.on('change', onAwarenessChange);

    return () => {
      provider?.awareness.off('change', onAwarenessChange);
      decorationsRef.current?.clear();
      decorationsRef.current = null;
      bindingRef.current?.destroy();
      bindingRef.current = null;
    };
  }, [ydoc, provider, activeFileId]);

  const handleRunCode = async () => {
    if (!ydoc) return;
    setIsTerminalOpen(true);
    setIsRunning(true);
    setOutput('⏳ Starting execution...\n');
    const code = ydoc.getText(`file:${activeFileId}`).toString();
    const result = await executeCode(fileName, code);
    setOutput(result);
    setIsRunning(false);
  };

  const getCurrentCode = () => {
    if (!ydoc) return '';
    return ydoc.getText(`file:${activeFileId}`).toString();
  };

  const downloadCurrentFile = () => {
    if (!activeFile) return;

    const blob = new Blob([getCurrentCode()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = activeFile.name.replace(/[\\/:*?"<>|]/g, '_');
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!ydoc || !provider) {
    return (
      <div className="editor-connecting">
        <Loader2 size={20} className="animate-spin" />
        <span>Connecting to collaboration server...</span>
      </div>
    );
  }

  return (
    <div className="editor-root">
      {/* ── Action bar ── */}
      <div className="editor-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="editor-filename">{fileName}</span>
          <span className="badge badge-accent" style={{ fontSize: '10px' }}>{language}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            className="btn btn-ghost"
            style={{ fontSize: '12px', padding: '4px 10px' }}
            onClick={downloadCurrentFile}
            disabled={!activeFile}
            title="Download the current file"
          >
            <Download size={13} /> Download
          </button>
          <button
            className={`btn btn-ghost ${showAI ? 'active' : ''}`}
            style={showAI ? { background: 'var(--accent-primary-muted)', color: 'var(--accent-primary-hover)', borderColor: 'var(--accent-primary)', fontSize: '12px', padding: '4px 10px' } : { fontSize: '12px', padding: '4px 10px' }}
            onClick={() => setShowAI(v => !v)}
          >
            <Sparkles size={13} /> AI
          </button>
          <button
            className="btn btn-success"
            style={{ padding: '5px 14px', fontSize: '12px' }}
            onClick={handleRunCode}
            disabled={isRunning}
          >
            {isRunning ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} style={{ fill: 'currentColor' }} />}
            {isRunning ? 'Running...' : 'Run'}
          </button>
        </div>
      </div>

      {/* ── Main pane: Editor + AI ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Monaco */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <MonacoEditor
            height="100%"
            language={language}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontLigatures: true,
              wordWrap: 'on',
              padding: { top: 16, bottom: 16 },
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
              renderLineHighlight: 'all',
              lineNumbersMinChars: 3,
              bracketPairColorization: { enabled: true },
              guides: { bracketPairs: true, indentation: true },
              suggest: { showIcons: true },
              formatOnPaste: true,
              tabSize: 2,
            }}
            onMount={handleEditorMount}
          />
        </div>

        {/* AI Panel */}
        {showAI && (
          <AIPanel
            code={getCurrentCode()}
            language={language}
            onClose={() => setShowAI(false)}
          />
        )}
      </div>

      {/* ── Terminal ── */}
      {isTerminalOpen && (
        <div className="terminal" style={{ height: terminalHeight }}>
          <div className="terminal-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
              <TerminalIcon size={13} />
              <span style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.05em' }}>OUTPUT</span>
              {isRunning && <Loader2 size={12} className="animate-spin" style={{ color: 'var(--accent-warning)' }} />}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                className="btn-icon"
                onClick={() => setTerminalHeight(h => Math.max(100, h - 60))}
                title="Shrink"
              >
                <ChevronDown size={13} />
              </button>
              <button
                className="btn-icon"
                onClick={() => setTerminalHeight(h => Math.min(500, h + 60))}
                title="Expand"
              >
                <ChevronUp size={13} />
              </button>
              <button
                className="btn-icon"
                onClick={() => setIsTerminalOpen(false)}
                title="Close terminal"
              >
                <X size={13} />
              </button>
            </div>
          </div>
          <div className="terminal-body">
            <pre className="terminal-output">{output}</pre>
          </div>
        </div>
      )}

      <style>{`
        .editor-root {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
          background: #1e1e1e; /* matches vs-dark */
        }
        .editor-connecting {
          flex: 1;
          display: flex; align-items: center; justify-content: center;
          gap: 10px; color: var(--text-muted); font-size: 13px;
        }
        .editor-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 14px;
          background: var(--bg-surface);
          border-bottom: 1px solid var(--border-subtle);
          flex-shrink: 0;
        }
        .editor-filename {
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--text-secondary);
          background: var(--bg-elevated);
          padding: 2px 8px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-subtle);
        }

        /* AI Panel */
        .ai-panel {
          width: 280px;
          flex-shrink: 0;
          background: var(--bg-surface);
          border-left: 1px solid var(--border-subtle);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .ai-panel-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 14px;
          border-bottom: 1px solid var(--border-subtle);
          flex-shrink: 0;
        }
        .ai-panel-quick-actions {
          display: flex; flex-wrap: wrap; gap: 6px;
          padding: 10px 12px;
          border-bottom: 1px solid var(--border-subtle);
        }
        .ai-quick-btn {
          padding: 4px 8px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-full);
          font-size: 11px; color: var(--text-secondary);
          cursor: pointer; font-family: var(--font-sans);
          transition: all var(--transition-fast);
        }
        .ai-quick-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .ai-response {
          flex: 1; overflow-y: auto; padding: 12px;
        }
        .ai-response pre {
          font-family: var(--font-mono); font-size: 12px;
          color: var(--text-secondary); white-space: pre-wrap; word-break: break-word;
          line-height: 1.6;
        }
        .ai-input-row {
          display: flex; gap: 6px; padding: 10px 12px;
          border-top: 1px solid var(--border-subtle);
          flex-shrink: 0;
        }

        /* Terminal */
        .terminal {
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          background: #0d1117;
          border-top: 1px solid var(--border-subtle);
          min-height: 100px;
        }
        .terminal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 6px 14px;
          background: var(--bg-surface);
          border-bottom: 1px solid var(--border-subtle);
          flex-shrink: 0;
        }
        .terminal-body { flex: 1; overflow-y: auto; padding: 12px 16px; }
        .terminal-output {
          font-family: var(--font-mono); font-size: 12px;
          color: #3fb950; line-height: 1.6;
          white-space: pre-wrap; word-break: break-all;
        }
      `}</style>
    </div>
  );
}
