const PYODIDE_VERSION = '314.0.7';
const PYODIDE_MODULE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.mjs`;
const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const MAX_OUTPUT_LENGTH = 50_000;

function formatValue(value) {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack || value.message;
  try {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
}

function createConsole(write) {
  const log = (...values) => write(values.map(formatValue).join(' '));
  return { log, info: log, debug: log, warn: log, error: log, table: log, dir: log };
}

async function runJavaScript(code) {
  const lines = [];
  const write = (line) => {
    if (lines.join('\n').length < MAX_OUTPUT_LENGTH) lines.push(line);
  };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction('console', code)(createConsole(write));
  return lines.join('\n');
}

async function runPython(code) {
  self.postMessage({ type: 'loading' });
  const { loadPyodide } = await import(/* @vite-ignore */ PYODIDE_MODULE_URL);
  let output = '';
  const append = (value) => {
    if (output.length < MAX_OUTPUT_LENGTH) output += `${value}\n`;
  };
  const pyodide = await loadPyodide({
    indexURL: PYODIDE_INDEX_URL,
    stdout: append,
    stderr: (value) => append(`Error: ${value}`),
  });

  // Load supported pure-Python and Pyodide-built packages referenced by imports.
  await pyodide.loadPackagesFromImports(code);
  self.postMessage({ type: 'started' });
  const globals = pyodide.globals.get('dict')();
  try {
    const result = await pyodide.runPythonAsync(code, { globals });
    if (result !== undefined && result !== null && String(result) !== 'None') {
      append(String(result));
    }
  } finally {
    globals.destroy();
  }
  return output.trimEnd();
}

self.onmessage = async (event) => {
  const { language, code } = event.data || {};
  try {
    let output;
    if (language === 'python') {
      output = await runPython(code);
    } else {
      self.postMessage({ type: 'started' });
      output = await runJavaScript(code);
    }
    self.postMessage({ type: 'result', output: output.slice(0, MAX_OUTPUT_LENGTH) });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
