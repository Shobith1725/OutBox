import { Router, Request, Response } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { requireAuth } from '../auth/middleware';
import prisma from '../lib/prisma';
import { scheduleEmails } from '../services/scheduler';
import { searchEmails } from '../lib/elasticsearch';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * POST /api/emails/schedule
 * Creates an EmailCampaign + N ScheduledEmail rows, enqueues N BullMQ delayed jobs.
 */
router.post('/schedule', requireAuth, async (req: Request, res: Response) => {
  const user = req.user as any;
  const {
    subject,
    body,
    senderId,
    recipients,
    startTime,
    delayBetweenEmailsMs,
    maxEmailsPerHour,
  } = req.body;

  // Validation
  if (!subject || !body || !senderId || !recipients || !startTime) {
    return res.status(400).json({
      error: 'Missing required fields: subject, body, senderId, recipients, startTime',
    });
  }

  if (!Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: 'recipients must be a non-empty array of emails' });
  }

  // Verify sender belongs to user
  const sender = await prisma.sender.findFirst({
    where: { id: senderId, userId: user.id },
  });

  if (!sender) {
    return res.status(404).json({ error: 'Sender not found or does not belong to you' });
  }

  try {
    const result = await scheduleEmails({
      userId: user.id,
      senderId,
      subject,
      body,
      recipients,
      startTime: new Date(startTime),
      delayBetweenEmailsMs: delayBetweenEmailsMs || 2000,
      maxEmailsPerHour: maxEmailsPerHour || 100,
    });

    res.status(201).json(result);
  } catch (err: any) {
    console.error('[API] Schedule error:', err.message);
    res.status(500).json({ error: 'Failed to schedule emails', details: err.message });
  }
});

/**
 * POST /api/emails/upload-csv
 * Parse CSV/TXT file of leads, return detected emails.
 */
router.post('/upload-csv', requireAuth, upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const content = req.file.buffer.toString('utf-8');
    const emails: string[] = [];

    // Try parsing as CSV first
    try {
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });

      for (const record of records) {
        // Look for email columns
        const emailValue =
          record.email || record.Email || record.EMAIL ||
          record.email_address || record.EmailAddress ||
          record['E-mail'] || record['e-mail'];

        if (emailValue && isValidEmail(emailValue)) {
          emails.push(emailValue.trim().toLowerCase());
        }
      }
    } catch {
      // Fall back to plain text — one email per line
      const lines = content.split(/[\r\n,;]+/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (isValidEmail(trimmed)) {
          emails.push(trimmed.toLowerCase());
        }
      }
    }

    // Deduplicate
    const uniqueEmails = [...new Set(emails)];

    res.json({
      emails: uniqueEmails,
      count: uniqueEmails.length,
    });
  } catch (err: any) {
    console.error('[API] CSV parse error:', err.message);
    res.status(400).json({ error: 'Failed to parse file', details: err.message });
  }
});

/**
 * GET /api/emails/scheduled
 * List scheduled emails (status=pending/processing) with pagination.
 */
router.get('/scheduled', requireAuth, async (req: Request, res: Response) => {
  const user = req.user as any;
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 20;
  const search = (req.query.search as string) || '';

  const where: any = {
    campaign: { userId: user.id },
    status: { in: ['pending', 'processing'] as any },
  };

  if (search) {
    where.OR = [
      { recipientEmail: { contains: search, mode: 'insensitive' } },
      { campaign: { subject: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.scheduledEmail.findMany({
      where: where as any,
      include: {
        campaign: {
          include: { sender: { select: { displayName: true, fromEmail: true } } },
        },
      },
      orderBy: { scheduledAt: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.scheduledEmail.count({ where: where as any }),
  ]);

  res.json({
    data: data.map((e) => ({
      id: e.id,
      recipientEmail: e.recipientEmail,
      subject: e.campaign.subject,
      body: e.campaign.body,
      scheduledAt: e.scheduledAt.toISOString(),
      status: e.status,
      sentAt: e.sentAt?.toISOString() || null,
      error: e.error,
      previewUrl: e.previewUrl,
      senderEmail: e.campaign.sender.fromEmail,
      senderName: e.campaign.sender.displayName,
      campaignId: e.campaignId,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
});

/**
 * GET /api/emails/sent
 * List sent + failed emails with pagination.
 */
router.get('/sent', requireAuth, async (req: Request, res: Response) => {
  const user = req.user as any;
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 20;
  const search = (req.query.search as string) || '';

  const where: any = {
    campaign: { userId: user.id },
    status: { in: ['sent', 'failed'] as any },
  };

  if (search) {
    where.OR = [
      { recipientEmail: { contains: search, mode: 'insensitive' } },
      { campaign: { subject: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.scheduledEmail.findMany({
      where: where as any,
      include: {
        campaign: {
          include: { sender: { select: { displayName: true, fromEmail: true } } },
        },
      },
      orderBy: { sentAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.scheduledEmail.count({ where: where as any }),
  ]);

  res.json({
    data: data.map((e) => ({
      id: e.id,
      recipientEmail: e.recipientEmail,
      subject: e.campaign.subject,
      body: e.campaign.body,
      scheduledAt: e.scheduledAt.toISOString(),
      status: e.status,
      sentAt: e.sentAt?.toISOString() || null,
      error: e.error,
      previewUrl: e.previewUrl,
      senderEmail: e.campaign.sender.fromEmail,
      senderName: e.campaign.sender.displayName,
      campaignId: e.campaignId,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
});

/**
 * GET /api/emails/search
 * Elasticsearch-backed search across both scheduled and sent emails.
 */
router.get('/search', requireAuth, async (req: Request, res: Response) => {
  const q = (req.query.q as string) || '';
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 20;

  if (!q.trim()) {
    return res.json({ data: [], total: 0, page, pageSize, totalPages: 0 });
  }

  const result = await searchEmails(q, page, pageSize);

  res.json({
    data: result.hits,
    total: result.total,
    page,
    pageSize,
    totalPages: Math.ceil(result.total / pageSize),
  });
});

/** Basic email validation */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default router;
