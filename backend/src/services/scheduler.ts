import prisma from '../lib/prisma';
import { emailQueue } from '../lib/queue';
import { indexEmail } from '../lib/elasticsearch';
import { config } from '../config';

interface ScheduleParams {
  userId: string;
  senderId: string;
  subject: string;
  body: string;
  recipients: string[];
  startTime: Date;
  delayBetweenEmailsMs: number;
  maxEmailsPerHour: number;
}

/**
 * Core scheduling logic:
 * 1. Create EmailCampaign
 * 2. For each recipient, INSERT a ScheduledEmail row (status='pending') with a
 *    deterministic bullJobId FIRST (DB row must exist before the BullMQ job)
 * 3. Then enqueue a BullMQ delayed job with the same jobId
 * 
 * The delay for each email is staggered:
 *   - Each email is offset by index * delayBetweenEmailsMs from startTime
 *   - Additionally, emails are bucketed by the hourly rate limit
 *     (e.g., if limit is 100/hr and there are 250 recipients, emails 101-200
 *      are pushed to startTime + 1hr, 201-250 to startTime + 2hr)
 * 
 * This staggering approach (vs BullMQ's built-in limiter) was chosen because:
 *   - It pre-computes all delays at enqueue time → predictable scheduling
 *   - Each job knows its exact scheduledAt → visible in the dashboard
 *   - The Redis rate limiter in the worker is a safety net, not the primary
 *     mechanism (belt + suspenders)
 */
export async function scheduleEmails(params: ScheduleParams) {
  const {
    userId,
    senderId,
    subject,
    body,
    recipients,
    startTime,
    delayBetweenEmailsMs,
    maxEmailsPerHour,
  } = params;

  // 1. Create the campaign
  const campaign = await prisma.emailCampaign.create({
    data: {
      userId,
      senderId,
      subject,
      body,
      delayBetweenEmailsMs,
      maxEmailsPerHour,
      startTime,
    },
  });

  const now = Date.now();
  const startMs = startTime.getTime();
  let jobsCreated = 0;

  // 2. For each recipient, compute staggered scheduledAt and create DB row + BullMQ job
  for (let i = 0; i < recipients.length; i++) {
    const recipientEmail = recipients[i].trim().toLowerCase();
    if (!recipientEmail) continue;

    // Compute the hour bucket for this recipient based on rate limit
    const hourBucket = Math.floor(i / maxEmailsPerHour);
    const indexWithinBucket = i % maxEmailsPerHour;

    // scheduledAt = startTime + (hourBucket * 1hr) + (indexWithinBucket * delay)
    const scheduledAtMs =
      startMs +
      hourBucket * 3600000 +
      indexWithinBucket * delayBetweenEmailsMs;

    const scheduledAt = new Date(scheduledAtMs);
    const delayFromNow = Math.max(0, scheduledAtMs - now);

    // Deterministic jobId for idempotency
    const bullJobId = `email-${campaign.id}-${i}`;

    // 2a. DB row FIRST (must exist before the job for crash recovery)
    const scheduledEmail = await prisma.scheduledEmail.create({
      data: {
        campaignId: campaign.id,
        recipientEmail,
        scheduledAt,
        status: 'pending',
        bullJobId,
      },
    });

    // 2b. Index to Elasticsearch
    await indexEmail({
      id: scheduledEmail.id,
      recipient: recipientEmail,
      subject,
      status: 'pending',
      scheduledAt: scheduledAt.toISOString(),
      senderId,
      campaignId: campaign.id,
      body,
    });

    // 2c. Enqueue BullMQ delayed job with the same deterministic jobId
    await emailQueue.add(
      'send-email',
      {
        scheduledEmailId: scheduledEmail.id,
        campaignId: campaign.id,
        senderId,
        recipientEmail,
        subject,
        body,
        userId,
      },
      {
        jobId: bullJobId,
        delay: delayFromNow,
      }
    );

    jobsCreated++;
  }

  return {
    campaignId: campaign.id,
    jobsCreated,
    startTime: startTime.toISOString(),
  };
}
