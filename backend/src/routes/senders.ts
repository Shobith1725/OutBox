import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth/middleware';
import prisma from '../lib/prisma';

const router = Router();

/**
 * GET /api/senders — list all senders for the current user.
 * Used by the compose modal's sender dropdown.
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const user = req.user as any;

  const senders = await prisma.sender.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      displayName: true,
      fromEmail: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  res.json(senders);
});

export default router;
