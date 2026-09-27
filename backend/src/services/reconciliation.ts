import prisma from '../lib/prisma';
import { emailQueue } from '../lib/queue';
import { indexEmail } from '../lib/elasticsearch';

/**
 * Startup reconciliation routine.
 * 
 * Runs on worker startup (and optionally periodically) to handle:
 * 1. Redis volume was wiped but Postgres still has pending emails
 * 2. Server crashed between DB insert and BullMQ add
 * 3. Jobs in Redis got lost due to any desync
 * 
 * For each pending ScheduledEmail with no corresponding live BullMQ job:
 *   - Re-enqueue with the SAME deterministic jobId
 *   - BullMQ will no-op on duplicate adds (jobId is UNIQUE)
 *   - Re-upsert to Elasticsearch so search stays consistent
 * 
 * This is safe because:
 *   - jobId is deterministic: email-${campaignId}-${index}
 *   - BullMQ rejects duplicate jobIds → zero duplicate sends
 *   - The worker checks status='sent' before sending → idempotent at execution
 */
export async function reconcilePendingEmails(): Promise<number> {
  console.log('[Reconciliation] Starting reconciliation of pending emails...');

  // Find all pending/processing emails
  const pendingEmails = await prisma.scheduledEmail.findMany({
    where: {
      status: { in: ['pending', 'processing'] },
    },
    include: {
      campaign: {
        include: {
          sender: true,
        },
      },
    },
  });

  if (pendingEmails.length === 0) {
    console.log('[Reconciliation] No pending emails to reconcile.');
    return 0;
  }

  console.log(`[Reconciliation] Found ${pendingEmails.length} pending/processing emails to check.`);

  let reconciled = 0;

  for (const email of pendingEmails) {
    try {
      // Check if the BullMQ job still exists or previously failed
      const existingJob = await emailQueue.getJob(email.bullJobId);
      const isFailed = existingJob ? await existingJob.isFailed() : false;

      if (!existingJob || isFailed) {
        if (existingJob && isFailed) {
          await existingJob.remove().catch(() => {});
        }

        // Job is missing or failed — re-enqueue it
        const now = Date.now();
        const scheduledAtMs = email.scheduledAt.getTime();
        const delay = Math.max(0, scheduledAtMs - now);

        await emailQueue.add(
          'send-email',
          {
            scheduledEmailId: email.id,
            campaignId: email.campaignId,
            senderId: email.campaign.senderId,
            recipientEmail: email.recipientEmail,
            subject: email.campaign.subject,
            body: email.campaign.body,
            userId: email.campaign.userId,
          },
          {
            jobId: email.bullJobId,
            delay,
          }
        );

        // Reset status to pending if it was stuck in processing
        if (email.status === 'processing') {
          await prisma.scheduledEmail.update({
            where: { id: email.id },
            data: { status: 'pending' },
          });
        }

        // Re-upsert to Elasticsearch for consistency
        await indexEmail({
          id: email.id,
          recipient: email.recipientEmail,
          subject: email.campaign.subject,
          status: 'pending',
          scheduledAt: email.scheduledAt.toISOString(),
          senderId: email.campaign.senderId,
          campaignId: email.campaignId,
          senderEmail: email.campaign.sender?.fromEmail || '',
          body: email.campaign.body,
        });

        reconciled++;
        console.log(`[Reconciliation] Re-enqueued job ${email.bullJobId}`);
      } else {
        // Job exists — just ensure ES is consistent
        await indexEmail({
          id: email.id,
          recipient: email.recipientEmail,
          subject: email.campaign.subject,
          status: email.status,
          scheduledAt: email.scheduledAt.toISOString(),
          senderId: email.campaign.senderId,
          campaignId: email.campaignId,
          senderEmail: email.campaign.sender?.fromEmail || '',
          body: email.campaign.body,
        });
      }
    } catch (err: any) {
      // If it's a duplicate jobId error, that's fine — the job already exists
      if (err.message?.includes('Duplicated')) {
        console.log(`[Reconciliation] Job ${email.bullJobId} already exists (expected).`);
      } else {
        console.error(`[Reconciliation] Error processing email ${email.id}:`, err.message);
      }
    }
  }

  console.log(`[Reconciliation] Complete. Re-enqueued ${reconciled} jobs.`);
  return reconciled;
}
