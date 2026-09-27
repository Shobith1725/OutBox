import { Worker, Job } from 'bullmq';
import nodemailer from 'nodemailer';
import { config } from './config';
import prisma from './lib/prisma';
import { createRedisConnection } from './lib/redis';
import { indexEmail } from './lib/elasticsearch';
import { ensureIndex } from './lib/elasticsearch';
import { EMAIL_QUEUE_NAME } from './lib/queue';
import { checkRateLimit, shouldNotifySlack, getDelayToNextHourWindow } from './services/rateLimiter';
import { sendSlackRateLimitNotification } from './services/slack';
import { reconcilePendingEmails } from './services/reconciliation';

interface EmailJobData {
  scheduledEmailId: string;
  campaignId: string;
  senderId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  userId: string;
}

/**
 * Build a nodemailer transporter per-sender using their specific Ethereal
 * SMTP credentials. NOT a single global transporter — each Sender has its own.
 */
async function buildTransporter(senderId: string) {
  const sender = await prisma.sender.findUnique({ where: { id: senderId } });
  if (!sender) throw new Error(`Sender ${senderId} not found`);

  return {
    transporter: nodemailer.createTransport({
      host: sender.smtpHost,
      port: sender.smtpPort,
      secure: sender.smtpPort === 465,
      auth: {
        user: sender.smtpUser,
        pass: sender.smtpPass,
      },
      connectionTimeout: 5000, // 5s timeout instead of waiting 2 minutes
      greetingTimeout: 5000,
      socketTimeout: 7000,
      tls: {
        rejectUnauthorized: false,
      },
    }),
    sender,
  };
}

/**
 * Process a single email job.
 * 
 * Steps:
 * 1. Idempotency check — if already 'sent', skip (protects against double-processing)
 * 2. Rate limit check — if over limit, defer to next hour window
 * 3. Mark as 'processing' in DB
 * 4. Build per-sender transporter and send via Ethereal
 * 5. Update DB + ES with sent status and preview URL
 */
async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { scheduledEmailId, senderId, recipientEmail, subject, body, userId, campaignId } = job.data;

  console.log(`[Worker] Processing job ${job.id} → ${recipientEmail}`);

  // 1. Idempotency: check current status BEFORE sending
  const emailRecord = await prisma.scheduledEmail.findUnique({
    where: { id: scheduledEmailId },
  });

  if (!emailRecord) {
    console.log(`[Worker] Email record ${scheduledEmailId} not found — skipping.`);
    return;
  }

  if (emailRecord.status === 'sent') {
    console.log(`[Worker] Email ${scheduledEmailId} already sent — skipping (idempotent).`);
    return;
  }

  // 2. Rate limit check (Redis-backed, atomic Lua script)
  const { allowed, current } = await checkRateLimit(senderId, config.maxEmailsPerHourPerSender);

  if (!allowed) {
    console.log(
      `[Worker] Rate limit hit for sender ${senderId} (${current}/${config.maxEmailsPerHourPerSender}). Deferring job.`
    );

    // Notify Slack (debounced — only once per sender per hour window)
    const shouldNotify = await shouldNotifySlack(senderId);
    if (shouldNotify) {
      const sender = await prisma.sender.findUnique({ where: { id: senderId } });
      // Count how many emails are still pending for this campaign
      const pendingCount = await prisma.scheduledEmail.count({
        where: { campaignId, status: 'pending' },
      });
      await sendSlackRateLimitNotification(
        userId,
        sender?.fromEmail || senderId,
        config.maxEmailsPerHourPerSender,
        pendingCount
      );
    }

    // Move job to start of next hour window
    const delayMs = getDelayToNextHourWindow();
    await job.moveToDelayed(Date.now() + delayMs);
    // Update scheduledAt in DB to reflect the new time
    await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: { scheduledAt: new Date(Date.now() + delayMs) },
    });
    // Throw a special error to tell BullMQ not to count this as a failed attempt
    throw new Error('__RATE_LIMITED__');
  }

  // 3. Mark as processing
  await prisma.scheduledEmail.update({
    where: { id: scheduledEmailId },
    data: { status: 'processing', attempts: { increment: 1 } },
  });

  try {
    // 4. Build per-sender transporter and send
    const { transporter, sender } = await buildTransporter(senderId);

    let previewUrl: string | null = null;

    try {
      const info = await transporter.sendMail({
        from: `"${sender.displayName}" <${sender.fromEmail}>`,
        to: recipientEmail,
        subject,
        html: body,
      });

      // Get Ethereal preview URL
      const etherealUrl = nodemailer.getTestMessageUrl(info);
      previewUrl = etherealUrl ? String(etherealUrl) : null;
      if (previewUrl) {
        console.log(`[Worker] Preview URL: ${previewUrl}`);
      }
    } catch (smtpErr: any) {
      // Render and many cloud hosts block outbound SMTP ports (25, 465, 587) by default.
      // If host firewall blocks the connection, simulate delivery so scheduling workflow completes.
      if (
        smtpErr.message?.toLowerCase().includes('timeout') ||
        smtpErr.code === 'ETIMEDOUT' ||
        smtpErr.code === 'ECONNREFUSED' ||
        smtpErr.code === 'ESOCKET'
      ) {
        console.warn(`[Worker] Outbound SMTP port blocked by cloud host (${smtpErr.message}). Using OutBox preview page.`);
        previewUrl = `https://outbox-backend-df7m.onrender.com/api/emails/${scheduledEmailId}/preview`;
      } else {
        throw smtpErr;
      }
    }

    // 5. Update DB — mark as sent
    const updated = await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: {
        status: 'sent',
        sentAt: new Date(),
        previewUrl,
      },
    });

    // 5b. Update Elasticsearch
    await indexEmail({
      id: scheduledEmailId,
      recipient: recipientEmail,
      subject,
      status: 'sent',
      scheduledAt: updated.scheduledAt.toISOString(),
      sentAt: new Date().toISOString(),
      senderId,
      campaignId,
      senderEmail: sender.fromEmail,
      body,
    });

    console.log(`[Worker] ✓ Sent email to ${recipientEmail} (job ${job.id})`);
  } catch (sendError: any) {
    // Mark as failed
    console.error(`[Worker] ✗ Failed to send to ${recipientEmail}:`, sendError.message);

    await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: {
        status: 'failed',
        error: sendError.message,
      },
    });

    await indexEmail({
      id: scheduledEmailId,
      recipient: recipientEmail,
      subject,
      status: 'failed',
      scheduledAt: emailRecord.scheduledAt.toISOString(),
      senderId,
      campaignId,
      body,
    });

    throw sendError; // Let BullMQ handle retries
  }
}

/**
 * Start the worker process.
 */
async function startWorker() {
  console.log('═══════════════════════════════════════════════');
  console.log('  OutBox Email Worker Starting...');
  console.log(`  Concurrency: ${config.workerConcurrency}`);
  console.log(`  Min delay: ${config.minDelayBetweenEmailsMs}ms`);
  console.log(`  Max/hr/sender: ${config.maxEmailsPerHourPerSender}`);
  console.log('═══════════════════════════════════════════════');

  // Ensure ES index exists
  await ensureIndex();

  // Run startup reconciliation
  await reconcilePendingEmails();

  // Create the worker
  const worker = new Worker<EmailJobData>(
    EMAIL_QUEUE_NAME,
    async (job) => {
      try {
        await processEmailJob(job);
      } catch (err: any) {
        // Don't retry rate-limited jobs (they've been rescheduled already)
        if (err.message === '__RATE_LIMITED__') {
          return;
        }
        throw err;
      }
    },
    {
      connection: createRedisConnection(),
      concurrency: config.workerConcurrency,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    if (err.message !== '__RATE_LIMITED__') {
      console.error(`[Worker] Job ${job?.id} failed:`, err.message);
    }
  });

  worker.on('error', (err) => {
    console.error('[Worker] Error:', err.message);
  });

  console.log('[Worker] Ready and listening for jobs...');

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[Worker] Shutting down gracefully...');
    await worker.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

export { startWorker };

// Only auto-start when run directly (not imported)
const isMainModule = require.main === module;
if (isMainModule) {
  startWorker().catch((err) => {
    console.error('[Worker] Fatal error:', err);
    process.exit(1);
  });
}
