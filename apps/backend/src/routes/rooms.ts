import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from './auth';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { closeRoomConnections, revokeRoomConnections } from '../roomConnections';

const router = Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production'
  ? (() => { throw new Error('JWT_SECRET must be configured in production'); })()
  : 'super-secret-key-for-demo');

// ─── Schemas ─────────────────────────────────────────────────────
const CreateRoomSchema = z.object({
  name: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, {
    message: 'Room name can only contain lowercase letters, numbers, and hyphens',
  }),
});

const InviteSchema = z.object({
  friendId: z.string().uuid(),
});

const InviteByEmailSchema = z.object({
  email: z.string().email(),
  role: z.enum(['EDITOR', 'VIEWER']).default('EDITOR'),
});

// ─── Get all rooms for user ───────────────────────────────────────
router.get('/', requireAuth, async (req: any, res) => {
  const userId = req.user.userId;
  try {
    const rooms = await prisma.room.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { participants: { some: { userId } } },
        ],
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        participants: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(rooms);
  } catch {
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

// ─── Pending room access requests for rooms owned by the user ─────
router.get('/join-requests', requireAuth, async (req: any, res) => {
  try {
    const joinRequests = await prisma.roomJoinRequest.findMany({
      where: { status: 'PENDING', room: { ownerId: req.user.userId } },
      include: {
        room: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(joinRequests);
  } catch {
    res.status(500).json({ error: 'Failed to fetch room join requests' });
  }
});

// Tell the room page whether this user is allowed to enter. This prevents a
// pending requester from mistaking the editor shell for an approved room.
router.get('/:roomName/access', requireAuth, async (req: any, res) => {
  try {
    const room = await prisma.room.findUnique({
      where: { name: req.params.roomName },
      select: { id: true, name: true, ownerId: true },
    });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.ownerId === req.user.userId) return res.json({ allowed: true, role: 'OWNER', roomName: room.name });

    const access = await prisma.roomAccess.findUnique({
      where: { roomId_userId: { roomId: room.id, userId: req.user.userId } },
      select: { role: true },
    });
    if (access) return res.json({ allowed: true, role: access.role, roomName: room.name });

    const request = await prisma.roomJoinRequest.findUnique({
      where: { roomId_userId: { roomId: room.id, userId: req.user.userId } },
      select: { status: true },
    });
    return res.status(403).json({
      error: request?.status === 'PENDING'
        ? 'Your request is waiting for the room owner to approve it.'
        : request?.status === 'DENIED'
          ? 'The room owner denied your request.'
          : 'You do not have access to this room.',
      status: request?.status ?? 'NOT_REQUESTED',
    });
  } catch {
    return res.status(500).json({ error: 'Could not check room access' });
  }
});

// ─── Let a requester check whether the owner reviewed their request ─
router.get('/join-requests/:requestId', requireAuth, async (req: any, res) => {
  try {
    const joinRequest = await prisma.roomJoinRequest.findFirst({
      where: { id: req.params.requestId, userId: req.user.userId },
      include: { room: { select: { name: true } } },
    });
    if (!joinRequest) return res.status(404).json({ error: 'Room join request not found' });
    res.json({ status: joinRequest.status, roomName: joinRequest.room.name });
  } catch {
    res.status(500).json({ error: 'Failed to check room join request' });
  }
});

// ─── Owner approves or denies a pending room access request ───────
router.post('/join-requests/:requestId/decision', requireAuth, async (req: any, res) => {
  const decision = z.object({ status: z.enum(['ACCEPTED', 'DENIED']) }).safeParse(req.body);
  if (!decision.success) {
    return res.status(400).json({ error: 'Status must be ACCEPTED or DENIED' });
  }

  try {
    const joinRequest = await prisma.roomJoinRequest.findUnique({
      where: { id: req.params.requestId },
      include: { room: { select: { ownerId: true } } },
    });
    if (!joinRequest || joinRequest.room.ownerId !== req.user.userId) {
      return res.status(404).json({ error: 'Room join request not found' });
    }
    if (joinRequest.status !== 'PENDING') {
      return res.status(409).json({ error: 'This request has already been reviewed' });
    }

    await prisma.$transaction(async (tx) => {
      if (decision.data.status === 'ACCEPTED') {
        await tx.roomAccess.upsert({
          where: { roomId_userId: { roomId: joinRequest.roomId, userId: joinRequest.userId } },
          update: { role: joinRequest.role },
          create: { roomId: joinRequest.roomId, userId: joinRequest.userId, role: joinRequest.role },
        });
      } else {
        // Denying a request must also revoke any access granted earlier.
        await tx.roomAccess.deleteMany({
          where: { roomId: joinRequest.roomId, userId: joinRequest.userId },
        });
      }
      await tx.roomJoinRequest.update({
        where: { id: joinRequest.id },
        data: { status: decision.data.status },
      });
    });

    if (decision.data.status === 'DENIED') {
      revokeRoomConnections(joinRequest.roomId, joinRequest.userId);
    }

    res.json({ status: decision.data.status });
  } catch {
    res.status(500).json({ error: 'Failed to review room join request' });
  }
});

// ─── Create room ──────────────────────────────────────────────────
router.post('/', requireAuth, async (req: any, res) => {
  const userId = req.user.userId;
  const parsed = CreateRoomSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
  }
  const { name } = parsed.data;

  try {
    const existing = await prisma.room.findUnique({ where: { name } });
    if (existing) return res.status(400).json({ error: 'Room name already taken' });

    const room = await prisma.room.create({ data: { name, ownerId: userId } });
    res.json(room);
  } catch {
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// ─── Delete a room and all of its files ───────────────────────────
router.delete('/:roomId', requireAuth, async (req: any, res) => {
  try {
    const room = await prisma.room.findUnique({
      where: { id: req.params.roomId },
      select: { id: true, ownerId: true },
    });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.ownerId !== req.user.userId) {
      return res.status(403).json({ error: 'Only the room owner can delete this room' });
    }

    await prisma.room.delete({ where: { id: room.id } });
    closeRoomConnections(room.id);
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to delete room' });
  }
});

// ─── Invite friend by friendId ────────────────────────────────────
router.post('/:roomId/invite', requireAuth, async (req: any, res) => {
  const userId = req.user.userId;
  const { roomId } = req.params;
  const parsed = InviteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
  }
  const { friendId } = parsed.data;

  try {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room || room.ownerId !== userId) {
      return res.status(403).json({ error: 'Only the room owner can invite members' });
    }

    const isFriend = await prisma.friendship.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { user1Id: userId, user2Id: friendId },
          { user1Id: friendId, user2Id: userId },
        ],
      },
    });
    if (!isFriend) return res.status(400).json({ error: 'User is not your friend' });

    const access = await prisma.roomAccess.upsert({
      where: { roomId_userId: { roomId, userId: friendId } },
      update: {},
      create: { roomId, userId: friendId, role: 'EDITOR' },
    });
    await prisma.roomJoinRequest.deleteMany({ where: { roomId, userId: friendId } });
    res.json(access);
  } catch {
    res.status(500).json({ error: 'Failed to invite user' });
  }
});

// ─── Generate shareable invite link (signed JWT) ──────────────────
router.post('/:roomId/invite-link', requireAuth, async (req: any, res) => {
  const userId = req.user.userId;
  const { roomId } = req.params;
  const { role = 'EDITOR', expiresIn = '7d' } = req.body;

  try {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room || room.ownerId !== userId) {
      return res.status(403).json({ error: 'Only the room owner can generate invite links' });
    }

    const token = jwt.sign(
      { roomId, roomName: room.name, role, invitedBy: userId },
      JWT_SECRET,
      { expiresIn }
    );

    res.json({ token, roomName: room.name, role, expiresIn });
  } catch {
    res.status(500).json({ error: 'Failed to generate invite link' });
  }
});

// ─── Request access to a room via invite link ─────────────────────
const requestRoomAccess = async (req: any, res: any) => {
  const userId = req.user.userId;
  const { token } = req.params;

  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      roomId: string; roomName: string; role: string; invitedBy: string;
    };

    // Don't re-add if already a participant or owner
    const room = await prisma.room.findUnique({ where: { id: payload.roomId } });
    if (!room || room.name !== payload.roomName) return res.status(404).json({ error: 'Room not found' });
    if (!['EDITOR', 'VIEWER'].includes(payload.role)) {
      return res.status(400).json({ error: 'Invite link has an invalid role' });
    }

    if (room.ownerId === userId) {
      return res.json({ roomName: room.name, status: 'ACCEPTED', message: 'You are the owner' });
    }

    const access = await prisma.roomAccess.findUnique({
      where: { roomId_userId: { roomId: payload.roomId, userId } },
    });
    if (access) return res.json({ roomName: room.name, status: 'ACCEPTED', role: access.role });

    const joinRequest = await prisma.roomJoinRequest.upsert({
      where: { roomId_userId: { roomId: payload.roomId, userId } },
      update: { role: payload.role, status: 'PENDING', createdAt: new Date() },
      create: { roomId: payload.roomId, userId, role: payload.role, status: 'PENDING' },
    });

    res.json({ roomName: room.name, role: payload.role, status: 'PENDING', requestId: joinRequest.id });
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return res.status(400).json({ error: 'Invite link has expired' });
    }
    res.status(400).json({ error: 'Invalid invite link' });
  }
};

// Keep GET for already-open links from older frontend sessions; new clients use POST.
router.get('/join/:token', requireAuth, requestRoomAccess);
router.post('/join/:token', requireAuth, requestRoomAccess);

// ─── Update a member's role ────────────────────────────────────────
router.patch('/:roomId/members/:memberId/role', requireAuth, async (req: any, res) => {
  const userId = req.user.userId;
  const { roomId, memberId } = req.params;
  const { role } = req.body;

  if (!['EDITOR', 'VIEWER'].includes(role)) {
    return res.status(400).json({ error: 'Role must be EDITOR or VIEWER' });
  }

  try {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room || room.ownerId !== userId) {
      return res.status(403).json({ error: 'Only the room owner can change roles' });
    }

    await prisma.roomAccess.update({
      where: { roomId_userId: { roomId, userId: memberId } },
      data: { role },
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// ─── Remove a member ──────────────────────────────────────────────
router.delete('/:roomId/members/:memberId', requireAuth, async (req: any, res) => {
  const userId = req.user.userId;
  const { roomId, memberId } = req.params;

  try {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room || room.ownerId !== userId) {
      return res.status(403).json({ error: 'Only the room owner can remove members' });
    }

    await prisma.roomAccess.delete({
      where: { roomId_userId: { roomId, userId: memberId } },
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

export default router;
