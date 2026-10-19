import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from './auth';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

const EmailSchema = z.object({
  email: z.string().email('Please provide a valid email address'),
});

// ─── Get friends (ACCEPTED) ───────────────────────────────────────
router.get('/', requireAuth, async (req: any, res) => {
  const userId = req.user.userId;
  try {
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { user1Id: userId, status: 'ACCEPTED' },
          { user2Id: userId, status: 'ACCEPTED' },
        ],
      },
      include: {
        user1: { select: { id: true, name: true, email: true } },
        user2: { select: { id: true, name: true, email: true } },
      },
    });
    const friends = friendships.map((f: any) => f.user1Id === userId ? f.user2 : f.user1);
    res.json(friends);
  } catch {
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
});

// ─── Pending requests ─────────────────────────────────────────────
router.get('/requests', requireAuth, async (req: any, res) => {
  const userId = req.user.userId;
  try {
    const requests = await prisma.friendship.findMany({
      where: { user2Id: userId, status: 'PENDING' },
      include: { user1: { select: { id: true, name: true, email: true } } },
    });
    res.json(requests);
  } catch {
    res.status(500).json({ error: 'Failed to fetch friend requests' });
  }
});

// ─── Send friend request ──────────────────────────────────────────
router.post('/request', requireAuth, async (req: any, res) => {
  const userId = req.user.userId;
  const parsed = EmailSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
  const { email } = parsed.data;

  try {
    const targetUser = await prisma.user.findUnique({ where: { email } });
    if (!targetUser) return res.status(404).json({ error: 'No user found with that email' });
    if (targetUser.id === userId) return res.status(400).json({ error: 'You cannot add yourself' });

    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { user1Id: userId, user2Id: targetUser.id },
          { user1Id: targetUser.id, user2Id: userId },
        ],
      },
    });
    if (existing) {
      return res.status(400).json({
        error: existing.status === 'ACCEPTED'
          ? 'You are already friends'
          : 'A friend request already exists',
      });
    }

    const request = await prisma.friendship.create({
      data: { user1Id: userId, user2Id: targetUser.id, status: 'PENDING' },
    });
    res.json(request);
  } catch {
    res.status(500).json({ error: 'Failed to send request' });
  }
});

// ─── Accept request ───────────────────────────────────────────────
router.post('/accept/:requestId', requireAuth, async (req: any, res) => {
  const userId = req.user.userId;
  const { requestId } = req.params;
  try {
    const friendship = await prisma.friendship.findUnique({ where: { id: requestId } });
    if (!friendship || friendship.user2Id !== userId || friendship.status !== 'PENDING') {
      return res.status(400).json({ error: 'Invalid or expired friend request' });
    }
    await prisma.friendship.update({ where: { id: requestId }, data: { status: 'ACCEPTED' } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to accept request' });
  }
});

// ─── Remove friend ────────────────────────────────────────────────
router.delete('/:friendId', requireAuth, async (req: any, res) => {
  const userId = req.user.userId;
  const { friendId } = req.params;
  try {
    await prisma.friendship.deleteMany({
      where: {
        status: 'ACCEPTED',
        OR: [
          { user1Id: userId, user2Id: friendId },
          { user1Id: friendId, user2Id: userId },
        ],
      },
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

export default router;
