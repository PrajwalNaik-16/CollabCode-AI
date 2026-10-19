import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { PrismaClient } from '@prisma/client';
import { setupWSConnection, setPersistence } from 'y-websocket/bin/utils';
import * as Y from 'yjs';
import path from 'path';
import authRouter, { requireAuth, verifyWsToken } from './routes/auth';
import { URL } from 'url';
import { trackRoomConnection } from './roomConnections';

const prisma = new PrismaClient();
const app = express();
const port = Number(process.env.PORT || 3001);

async function getRoomPermission(roomName: string, userId: string) {
  const room = await prisma.room.findUnique({ where: { name: roomName } });
  if (!room) return { room: null, role: null };
  if (room.ownerId === userId) return { room, role: 'OWNER' };
  const access = await prisma.roomAccess.findUnique({
    where: { roomId_userId: { roomId: room.id, userId } },
    select: { role: true },
  });
  return { room, role: access?.role ?? null };
}

async function canEditFile(fileId: string, userId: string, roomName?: string) {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    include: { room: { select: { name: true, ownerId: true, id: true } } },
  });
  if (!file || (roomName && file.room.name !== roomName)) return false;
  if (file.room.ownerId === userId) return true;
  const access = await prisma.roomAccess.findUnique({
    where: { roomId_userId: { roomId: file.room.id, userId } },
    select: { role: true },
  });
  return access?.role === 'EDITOR';
}

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRouter);

import friendsRouter from './routes/friends';
import roomsRouter from './routes/rooms';
import aiRouter from './routes/ai';
app.use('/api/friends', friendsRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/ai', aiRouter);

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'unavailable' });
  }
});

// ─── File Routes ──────────────────────────────────────────────────

app.get('/api/rooms/:roomId/files', requireAuth, async (req, res) => {
  const { roomId } = req.params;
  const userId = (req as any).user.userId;
  const permission = await getRoomPermission(roomId, userId);
  if (!permission.room) return res.json([]);
  if (!permission.role) return res.status(403).json({ error: 'You do not have access to this room' });

  const files = await prisma.file.findMany({
    where: { room: { name: roomId } },
    select: { id: true, name: true, createdAt: true },
    // Open the most recently edited file first for people joining a room.
    orderBy: { updatedAt: 'desc' },
  });
  res.json(files);
});

app.post('/api/rooms/:roomId/files', requireAuth, async (req: any, res) => {
  const { roomId } = req.params;
  const { name } = req.body;
  const userId = req.user.userId;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'File name is required' });
  }

  const room = await prisma.room.findFirst({ where: { name: roomId } });
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const permission = await getRoomPermission(roomId, userId);
  if (permission.role !== 'OWNER' && permission.role !== 'EDITOR') {
    return res.status(403).json({ error: 'You do not have permission to edit this room' });
  }

  // Prevent duplicate file names in a room
  const existing = await prisma.file.findFirst({
    where: { roomId: room.id, name: name.trim() },
  });
  if (existing) return res.status(400).json({ error: 'A file with that name already exists' });

  const file = await prisma.file.create({
    data: { name: name.trim(), roomId: room.id },
  });
  res.json(file);
});

// ── Rename file ──────────────────────────────────────────────────
app.patch('/api/rooms/:roomId/files/:fileId', requireAuth, async (req: any, res) => {
  const { roomId, fileId } = req.params;
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'New name is required' });
  }

  if (!await canEditFile(fileId, req.user.userId, roomId)) {
    return res.status(403).json({ error: 'You do not have permission to edit this file' });
  }

  try {
    const file = await prisma.file.update({
      where: { id: fileId },
      data: { name: name.trim() },
    });
    res.json(file);
  } catch (err) {
    res.status(404).json({ error: 'File not found' });
  }
});

// ── Delete file ──────────────────────────────────────────────────
app.delete('/api/rooms/:roomId/files/:fileId', requireAuth, async (req: any, res) => {
  const { roomId, fileId } = req.params;

  if (!await canEditFile(fileId, req.user.userId, roomId)) {
    return res.status(403).json({ error: 'You do not have permission to delete this file' });
  }

  try {
    await prisma.file.delete({ where: { id: fileId } });
    res.json({ success: true });
  } catch (err) {
    res.status(404).json({ error: 'File not found' });
  }
});

// ─── Code Execution API ──────────────────────────────────────────
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import { existsSync, readdirSync } from 'fs';
import os from 'os';

const execAsync = promisify(exec);
const EXEC_TIMEOUT = 10000;

async function findPythonCommand(): Promise<string | null> {
  const candidates: string[] = [];
  if (process.env.PYTHON_PATH?.trim()) {
    candidates.push(process.env.PYTHON_PATH.trim().replace(/^"|"$/g, ''));
  }

  // Include common per-user Windows installs even when the backend was
  // started before Python was added to PATH.
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || (
      process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Local') : undefined
    );
    const pythonRoot = localAppData ? path.join(localAppData, 'Programs', 'Python') : undefined;
    try {
      const versions = pythonRoot ? readdirSync(pythonRoot)
        .filter(name => /^Python\d+$/i.test(name))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true })) : [];
      for (const version of versions) {
        if (pythonRoot) candidates.push(path.join(pythonRoot, version, 'python.exe'));
      }
    } catch {
      // Python may be installed elsewhere; check PATH and the Windows launcher.
    }
  }

  for (const candidate of candidates) {
    if (candidate.includes('/') || candidate.includes('\\')) {
      if (!existsSync(candidate)) continue;
      try {
        await execAsync(`"${candidate}" --version`, { timeout: 3000 });
        return `"${candidate}"`;
      } catch {
        continue;
      }
    }
  }

  const commands = process.platform === 'win32'
    ? ['py -3', 'python', 'python3']
    : ['python3', 'python'];
  for (const command of commands) {
    try {
      await execAsync(`${command} --version`, { timeout: 3000 });
      return command;
    } catch {
      // Try the next supported launcher.
    }
  }
  return null;
}

async function findMsvcVcvars(): Promise<string | null> {
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const vswherePath = path.join(
    programFilesX86,
    'Microsoft Visual Studio',
    'Installer',
    'vswhere.exe',
  );
  if (!existsSync(vswherePath)) return null;

  try {
    const { stdout } = await execAsync(
      `"${vswherePath}" -latest -products * -property installationPath`,
      { timeout: 3000 },
    );
    const vcvarsPath = path.join(stdout.trim(), 'VC', 'Auxiliary', 'Build', 'vcvars64.bat');
    const windowsKitsInclude = path.join(programFilesX86, 'Windows Kits', '10', 'Include');
    const hasWindowsSdkHeaders = existsSync(windowsKitsInclude) && readdirSync(windowsKitsInclude)
      .some(version => existsSync(path.join(windowsKitsInclude, version, 'ucrt', 'crtdbg.h')));
    return existsSync(vcvarsPath) && hasWindowsSdkHeaders ? vcvarsPath : null;
  } catch {
    return null;
  }
}

async function runInSandbox(command: string, filePath: string, outPath?: string): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync(command, { timeout: EXEC_TIMEOUT });
    return stdout + (stderr ? `\nStderr:\n${stderr}` : '');
  } catch (err: any) {
    return (err.stdout || '') + (err.stderr ? `\nError:\n${err.stderr}` : err.message);
  } finally {
    await fs.unlink(filePath).catch(() => {});
    if (outPath) await fs.unlink(outPath).catch(() => {});
  }
}

app.post('/api/execute', requireAuth, async (req: any, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(503).json({
      error: 'Code execution is disabled in production until an isolated runner is configured.',
    });
  }

  const { language, code } = req.body;
  if (!code) return res.status(400).json({ error: 'No code provided' });

  try {
    const tmpDir = os.tmpdir();
    const fileId = `collab_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    let output = '';

    if (language === 'javascript') {
      const filePath = path.join(tmpDir, `${fileId}.js`);
      await fs.writeFile(filePath, code);
      output = await runInSandbox(`node "${filePath}"`, filePath);

    } else if (language === 'python') {
      const filePath = path.join(tmpDir, `${fileId}.py`);
      await fs.writeFile(filePath, code);
      const pythonCommand = await findPythonCommand();
      if (!pythonCommand) {
        await fs.unlink(filePath).catch(() => {});
        return res.status(503).json({
          error: 'Python was not found by the backend. Install Python or set PYTHON_PATH to the full python.exe path, then restart the backend.',
        });
      }
      output = await runInSandbox(`${pythonCommand} "${filePath}"`, filePath);

    } else if (language === 'c') {
      const filePath = path.join(tmpDir, `${fileId}.c`);
      const exePath = path.join(tmpDir, `${fileId}_c`);
      await fs.writeFile(filePath, code);
      try {
        await execAsync(`gcc "${filePath}" -o "${exePath}"`, { timeout: EXEC_TIMEOUT });
        output = await runInSandbox(`"${exePath}"`, filePath, exePath);
      } catch (err: any) {
        await fs.unlink(filePath).catch(() => {});
        output = err.stderr || err.message;
      }

    } else if (language === 'cpp') {
      const filePath = path.join(tmpDir, `${fileId}.cpp`);
      const exePath = path.join(tmpDir, `${fileId}_cpp${process.platform === 'win32' ? '.exe' : ''}`);
      await fs.writeFile(filePath, code);
      try {
        let compileAndRun: string;
        try {
          await execAsync('g++ --version', { timeout: 3000 });
          compileAndRun = `g++ "${filePath}" -o "${exePath}" && "${exePath}"`;
        } catch {
          const vcvarsPath = process.platform === 'win32' ? await findMsvcVcvars() : null;
          if (!vcvarsPath) {
            throw new Error('No usable C++ toolchain was found. Install MinGW-w64 (g++) or add the Windows 10/11 SDK and C++ tools in Visual Studio Installer.');
          }
          compileAndRun = `call "${vcvarsPath}" && cl /nologo /EHsc /std:c++17 "${filePath}" /Fe:"${exePath}" && "${exePath}"`;
        }
        output = await runInSandbox(compileAndRun, filePath, exePath);
      } catch (err: any) {
        await fs.unlink(filePath).catch(() => {});
        await fs.unlink(exePath).catch(() => {});
        output = err.stderr || err.message;
      }

    } else if (language === 'java') {
      const className = `Collab_${fileId.replace(/-/g, '_')}`;
      const filePath = path.join(tmpDir, `${className}.java`);
      const modifiedCode = code.replace(/public\s+class\s+(\w+)/, `public class ${className}`);
      await fs.writeFile(filePath, modifiedCode);
      try {
        await execAsync(`javac "${filePath}"`, { timeout: EXEC_TIMEOUT });
        const classFile = path.join(tmpDir, `${className}.class`);
        const { stdout, stderr } = await execAsync(
          `java -cp "${tmpDir}" ${className}`, { timeout: EXEC_TIMEOUT }
        );
        output = stdout + (stderr ? `\nError:\n${stderr}` : '');
        await fs.unlink(filePath).catch(() => {});
        await fs.unlink(classFile).catch(() => {});
      } catch (err: any) {
        await fs.unlink(filePath).catch(() => {});
        output = (err.stdout || '') + (err.stderr ? `\nError:\n${err.stderr}` : err.message);
      }

    } else {
      return res.status(400).json({ error: `Language "${language}" is not supported.` });
    }

    res.json({ output: output || 'Program executed with no output.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Execution failed: ' + err.message });
  }
});

// In the production container, serve the built SPA from the same origin as
// the API and WebSocket endpoints. This avoids hard-coded localhost URLs.
const frontendDist = path.resolve(__dirname, '../public');
app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found' }));
app.use(express.static(frontendDist));
app.get(/.*/, (_req, res, next) => {
  res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
    if (err) next(err);
  });
});

// ─── Server & WebSocket Setup ─────────────────────────────────────

const server = http.createServer(app);
const wssSignaling = new WebSocketServer({ noServer: true });
const wssYjs = new WebSocketServer({ noServer: true });

// ── Yjs Persistence ──────────────────────────────────────────────
const yjsPersistenceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const yjsPersistenceWrites = new Map<string, Promise<void>>();

const persistYjsState = async (docName: string, ydoc: Y.Doc) => {
  const timer = yjsPersistenceTimers.get(docName);
  if (timer) {
    clearTimeout(timer);
    yjsPersistenceTimers.delete(docName);
  }

  // Serialize writes per file so an older snapshot cannot finish after and
  // overwrite a newer edit.
  const previousWrite = yjsPersistenceWrites.get(docName) ?? Promise.resolve();
  const currentWrite = previousWrite
    .catch(() => undefined)
    .then(async () => {
      const state = Y.encodeStateAsUpdate(ydoc);
      await prisma.file.update({
        where: { id: docName },
        data: { crdtBinary: Buffer.from(state) },
      });
    })
    .catch((err) => {
      console.warn(`[Yjs] Failed to persist doc ${docName}:`, err);
    });

  yjsPersistenceWrites.set(docName, currentWrite);
  await currentWrite;
  if (yjsPersistenceWrites.get(docName) === currentWrite) {
    yjsPersistenceWrites.delete(docName);
  }
};

setPersistence({
  bindState: async (docName: string, ydoc: Y.Doc) => {
    const file = await prisma.file.findUnique({ where: { id: docName } });
    if (file && file.crdtBinary) {
      Y.applyUpdate(ydoc, new Uint8Array(file.crdtBinary));
    }

    // Persist edits while collaborators are still connected. The y-websocket
    // default only calls writeState when the last client disconnects, which
    // can lose recent work if the backend or browser is interrupted.
    ydoc.on('update', () => {
      const existingTimer = yjsPersistenceTimers.get(docName);
      if (existingTimer) clearTimeout(existingTimer);
      yjsPersistenceTimers.set(docName, setTimeout(() => {
        void persistYjsState(docName, ydoc);
      }, 750));
    });
  },
  writeState: async (docName: string, ydoc: Y.Doc) => {
    await persistYjsState(docName, ydoc);
  },
});

// ── WebRTC Signaling — ROOM SCOPED ───────────────────────────────
// Map from roomKey -> Set<WebSocket>
const signalingRooms = new Map<string, Set<WebSocket>>();

wssSignaling.on('connection', (ws, req) => {
  const url = new URL(req.url || '', `http://localhost`);
  const roomKey = url.searchParams.get('room') || 'default';

  if (!signalingRooms.has(roomKey)) {
    signalingRooms.set(roomKey, new Set());
  }
  const roomClients = signalingRooms.get(roomKey)!;
  roomClients.add(ws);

  ws.on('message', (message, isBinary) => {
    // Relay only to peers in the SAME room
    roomClients.forEach(client => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(message, { binary: isBinary });
      }
    });
  });

  ws.on('close', () => {
    roomClients.delete(ws);
    if (roomClients.size === 0) signalingRooms.delete(roomKey);
  });
});

// ── Yjs sync server ──────────────────────────────────────────────
wssYjs.on('connection', (ws, req) => {
  const url = new URL(req.url || '', 'http://localhost');
  const fileId = decodeURIComponent(url.pathname.replace(/^\/yjs\//, ''));
  setupWSConnection(ws, req, { docName: fileId });
});

// ── Upgrade routing ──────────────────────────────────────────────
server.on('upgrade', (request, socket, head) => {
  void (async () => {
    const reject = (status: string) => {
      socket.write(`HTTP/1.1 ${status}\r\n\r\n`);
      socket.destroy();
    };

    try {
      const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
      const token = url.searchParams.get('token');
      const user = token ? verifyWsToken(token) as { userId?: string } | null : null;

      if (!user?.userId) return reject('401 Unauthorized');

      let fileId: string | null = null;
      let roomName: string | undefined;
      if (url.pathname === '/webrtc') {
        fileId = url.searchParams.get('fileId');
        roomName = url.searchParams.get('roomName') || undefined;
      } else {
        const match = url.pathname.match(/^\/yjs\/([^/]+)$/);
        if (match?.[1]) fileId = decodeURIComponent(match[1]);
      }

      if (!fileId || !await canEditFile(fileId, user.userId, roomName)) {
        return reject('403 Forbidden');
      }

      const file = await prisma.file.findUnique({ where: { id: fileId }, select: { roomId: true } });
      if (!file) return reject('404 Not Found');

      if (url.pathname === '/webrtc') {
        wssSignaling.handleUpgrade(request, socket, head, ws => {
          trackRoomConnection(file.roomId, user.userId!, ws);
          wssSignaling.emit('connection', ws, request);
        });
      } else if (url.pathname.startsWith('/yjs/')) {
        wssYjs.handleUpgrade(request, socket, head, ws => {
          trackRoomConnection(file.roomId, user.userId!, ws);
          wssYjs.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    } catch {
      reject('400 Bad Request');
    }
  })();
});

server.listen(port, '0.0.0.0', () => {
  console.log(`✅ Backend running at http://localhost:${port}`);
});
