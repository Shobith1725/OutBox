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
      previewUrl: (!e.previewUrl || e.previewUrl === 'https://ethereal.email/messages')
        ? `https://outbox-backend-df7m.onrender.com/api/emails/${e.id}/preview`
        : e.previewUrl,
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
 * GET /api/emails/:id/preview
 * Dedicated standalone HTML preview for sent emails.
 * Displays the exact email headers, recipient, sender, subject, and formatted body.
 */
router.get('/:id/preview', async (req: Request, res: Response) => {
  try {
    const email = await prisma.scheduledEmail.findUnique({
      where: { id: req.params.id },
      include: {
        campaign: {
          include: { sender: true },
        },
      },
    });

    if (!email) {
      return res.status(404).send('Email preview not found');
    }

    const senderName = email.campaign.sender?.displayName || 'Sender';
    const senderEmail = email.campaign.sender?.fromEmail || 'unknown';
    const recipient = email.recipientEmail;
    const subject = email.campaign.subject;
    const body = email.campaign.body;
    const sentAt = email.sentAt ? new Date(email.sentAt).toLocaleString() : 'Just now';

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject} — OutBox Email Preview</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b132b; color: #e2e8f0; margin: 0; padding: 40px 16px; display: flex; justify-content: center; }
          .container { width: 100%; max-width: 680px; }
          .card { background: #1c2541; border: 1px solid #3a506b; border-radius: 12px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); overflow: hidden; }
          .header { padding: 24px 28px; border-bottom: 1px solid #3a506b; background: #172138; }
          .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase; margin-bottom: 14px; }
          .badge::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: #10b981; }
          h1 { margin: 0 0 16px; font-size: 22px; color: #f8fafc; font-weight: 700; line-height: 1.3; }
          .meta-row { display: flex; align-items: baseline; margin-bottom: 8px; font-size: 13.5px; }
          .meta-label { width: 75px; color: #94a3b8; font-weight: 500; shrink: 0; }
          .meta-value { color: #f1f5f9; word-break: break-all; }
          .body-content { padding: 32px 28px; background: #0f172a; min-height: 180px; font-size: 15px; line-height: 1.6; color: #cbd5e1; white-space: pre-wrap; font-family: inherit; }
          .footer { padding: 14px 28px; background: #172138; border-top: 1px solid #3a506b; font-size: 12px; color: #64748b; display: flex; justify-content: space-between; align-items: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="card">
            <div class="header">
              <div class="badge">Delivered via OutBox</div>
              <h1>${subject}</h1>
              <div class="meta-row"><span class="meta-label">From:</span><span class="meta-value"><strong>${senderName}</strong> &lt;${senderEmail}&gt;</span></div>
              <div class="meta-row"><span class="meta-label">To:</span><span class="meta-value">${recipient}</span></div>
              <div class="meta-row"><span class="meta-label">Date:</span><span class="meta-value">${sentAt}</span></div>
            </div>
            <div class="body-content">${body}</div>
            <div class="footer">
              <span>OutBox Email Scheduler</span>
              <span>Status: Delivered (Sent)</span>
            </div>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (err: any) {
    res.status(500).send('Error rendering preview');
  }
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
  return /^[^\s@]+@[^\s@]+$/.test(email);
}

export default router;
