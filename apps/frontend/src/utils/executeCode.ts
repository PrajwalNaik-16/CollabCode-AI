import { useAuthStore } from '../store/authStore';
import { API_URL } from '../config';

type BrowserRunnerMessage = {
  type: 'ready' | 'loading' | 'started' | 'result' | 'error';
  output?: string;
  message?: string;
};

const MAX_BROWSER_RUNTIME_MS = 10_000;
const PYTHON_STARTUP_TIMEOUT_MS = 120_000;

export const getLanguageFromExtension = (filename: string): string | null => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    js: 'javascript',
    py: 'python',
    c: 'c',
    cpp: 'cpp',
    cxx: 'cpp',
    java: 'java',
  };
  return map[ext] || null;
};

export const canRunInBrowser = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return ext === 'js' || ext === 'py';
};

export const getExecutionHint = (filename: string): string => {
  if (canRunInBrowser(filename)) return 'Runs in your browser';
  if (!getLanguageFromExtension(filename)) return 'Unsupported file type';
  if (import.meta.env.PROD) return 'Online Run supports JavaScript and Python';
  return 'Runs with your local toolchain';
};

function runInBrowser(language: 'javascript' | 'python', code: string, onProgress?: (message: string) => void): Promise<string> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL('../workers/codeRunner.worker.js', import.meta.url), { type: 'module' });
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;

    const finish = (result: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      worker.terminate();
      resolve(result);
    };

    const armTimeout = (duration: number, message: string) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => finish(message), duration);
    };

    // Python's first run downloads the WebAssembly runtime; later runs use the
    // browser cache. Once execution starts, terminate infinite loops promptly.
    armTimeout(language === 'python' ? PYTHON_STARTUP_TIMEOUT_MS : MAX_BROWSER_RUNTIME_MS,
      language === 'python'
        ? 'Python runtime took too long to load. Check your internet connection and try again.'
        : 'Execution stopped after 10 seconds (time limit).');

    worker.onmessage = (event: MessageEvent<BrowserRunnerMessage>) => {
      const message = event.data;
      if (message.type === 'loading') {
        onProgress?.('Loading the Python runtime in your browser…');
      } else if (message.type === 'started') {
        onProgress?.('Running in your browser…');
        armTimeout(MAX_BROWSER_RUNTIME_MS, 'Execution stopped after 10 seconds (time limit).');
      } else if (message.type === 'result') {
        finish(message.output || 'Program finished with no output.');
      } else if (message.type === 'error') {
        finish(`Execution error: ${message.message || 'Unknown error'}`);
      }
    };

    worker.onerror = (event) => {
      event.preventDefault();
      finish(`Browser execution failed: ${event.message || 'Could not start the execution worker.'}`);
    };

    worker.postMessage({ language, code });
  });
}

export const executeCode = async (
  filename: string,
  code: string,
  onProgress?: (message: string) => void,
): Promise<string> => {
  const language = getLanguageFromExtension(filename);

  if (!language) {
    return `Unsupported file. Run supports .js, .py, .c, .cpp, .cxx, and .java files.`;
  }

  if (language === 'javascript' || language === 'python') {
    return runInBrowser(language, code, onProgress);
  }

  if (import.meta.env.PROD) {
    return 'Online execution supports JavaScript and Python, which run in your browser. C, C++, and Java need a local backend and compiler, so they are unavailable on this hosted site.';
  }

  const token = useAuthStore.getState().token;

  try {
    const response = await fetch(`${API_URL}/api/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify({ language, code }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        return 'Execution request failed: unauthorized. Please log in again.';
      }
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `API returned status ${response.status}`);
    }

    const data = await response.json();
    return data.output || 'No output generated.';
  } catch (error) {
    return `Execution request failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
};
