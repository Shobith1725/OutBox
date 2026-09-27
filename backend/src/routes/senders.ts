import { Router, Request, Response } from 'express';
import nodemailer from 'nodemailer';
import { requireAuth } from '../auth/middleware';
import prisma from '../lib/prisma';

const router = Router();

/**
 * GET /api/senders — list all senders for the current user.
 * Ensures the user's logged-in Google account is always present as the primary sender.
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const user = req.user as any;

  let senders = await prisma.sender.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      displayName: true,
      fromEmail: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  // Ensure there is always a sender matching the user's logged in Google account
  const hasUserSender = senders.some(
    (s) => s.fromEmail.toLowerCase() === user.email.toLowerCase()
  );

  if (!hasUserSender) {
    try {
      const testAccount = await nodemailer.createTestAccount();
      const userSender = await prisma.sender.create({
        data: {
          userId: user.id,
          displayName: user.name || user.email.split('@')[0],
          fromEmail: user.email,
          smtpHost: testAccount.smtp.host,
          smtpPort: testAccount.smtp.port,
          smtpUser: testAccount.user,
          smtpPass: testAccount.pass,
        },
        select: {
          id: true,
          displayName: true,
          fromEmail: true,
        },
      });
      senders = [userSender, ...senders];
    } catch (err) {
      console.error('[Senders] Failed to auto-create user sender:', err);
    }
  }

  res.json(senders);
});

export default router;
