import { useAuthStore } from '../store/authStore';
import { API_URL } from '../config';

export const getLanguageFromExtension = (filename: string): string | null => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    c: 'c',
    cpp: 'cpp',
    cxx: 'cpp',
    java: 'java',
    rs: 'rust',
    go: 'go',
  };
  return map[ext] || null;
};

export const executeCode = async (filename: string, code: string): Promise<string> => {
  const language = getLanguageFromExtension(filename);
  
  if (!language) {
    return `Error: Unsupported file extension or unable to determine language for "${filename}".\nCurrently supported extensions: .js, .ts, .py, .c, .cpp, .java`;
  }

  // TypeScript/TSX is transpiled to JS before execution
  const execLanguage = (language === 'typescript') ? 'javascript' : language;

  const token = useAuthStore.getState().token;

  try {
    const response = await fetch(`${API_URL}/api/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify({
        language: execLanguage,
        code,
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        return 'Execution Request Failed: Unauthorized. Please log in again.';
      }
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `API returned status ${response.status}`);
    }

    const data = await response.json();
    return data.output || 'No output generated.';
  } catch (error) {
    return `Execution Request Failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
};
