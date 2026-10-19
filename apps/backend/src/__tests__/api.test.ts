import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import authRouter from '../routes/auth';
import roomsRouter from '../routes/rooms';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/rooms', roomsRouter);

const prisma = new PrismaClient();

const databaseUrl = process.env.DATABASE_URL ?? '';
const databaseFile = databaseUrl.startsWith('file:')
  ? (databaseUrl.slice('file:'.length).split('?')[0] ?? '').replace(/\\/g, '/').split('/').pop() ?? ''
  : '';
if (databaseFile !== 'test.db' && databaseFile !== ':memory:') {
  throw new Error('API tests require DATABASE_URL=file:./test.db (or file::memory:). Refusing to run against a non-test database.');
}

// ─── Test users ───────────────────────────────────────────────────
const runId = `${process.pid}-${Date.now()}`;
const user1 = { email: `alice-${runId}@test.com`, password: 'password123', name: 'Alice' };
const user2 = { email: `bob-${runId}@test.com`, password: 'password123', name: 'Bob' };
const testRoomName = `test-room-${runId}`;

let token1: string;
let token2: string;

afterAll(async () => {
  await prisma.room.deleteMany({ where: { name: testRoomName } });
  await prisma.user.deleteMany({ where: { email: { in: [user1.email, user2.email] } } });
  await prisma.$disconnect();
});

// ─── Auth Tests ───────────────────────────────────────────────────
describe('POST /api/auth/register', () => {
  it('registers a new user and returns a token', async () => {
    const res = await request(app).post('/api/auth/register').send(user1);
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(user1.email);
    token1 = res.body.token;
  });

  it('registers a second user', async () => {
    const res = await request(app).post('/api/auth/register').send(user2);
    expect(res.status).toBe(201);
    token2 = res.body.token;
  });

  it('rejects duplicate email', async () => {
    const res = await request(app).post('/api/auth/register').send(user1);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it('rejects invalid email', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...user1, email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('rejects short password', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...user1, email: 'new@test.com', password: '123' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: user1.email, password: user1.password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('rejects wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: user1.email, password: 'wrongpass' });
    expect(res.status).toBe(401);
  });

  it('rejects unknown email', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nobody@test.com', password: 'anypass' });
    expect(res.status).toBe(401);
  });
});

// ─── Rooms Tests ──────────────────────────────────────────────────
describe('POST /api/rooms', () => {
  it('creates a room for authenticated user', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${token1}`)
      .send({ name: testRoomName });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(testRoomName);
  });

  it('rejects invalid room name (spaces)', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${token1}`)
      .send({ name: 'invalid room name' });
    expect(res.status).toBe(400);
  });

  it('rejects duplicate room name', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${token1}`)
      .send({ name: testRoomName });
    expect(res.status).toBe(400);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).post('/api/rooms').send({ name: 'hacker-room' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/rooms', () => {
  it('returns rooms for authenticated user', async () => {
    const res = await request(app)
      .get('/api/rooms')
      .set('Authorization', `Bearer ${token1}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/rooms');
    expect(res.status).toBe(401);
  });
});

