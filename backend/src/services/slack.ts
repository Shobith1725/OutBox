import prisma from '../lib/prisma';

/**
 * Send a Slack notification when a rate limit is hit.
 * Looks up the webhook/token from DB at call-time (not cached at boot)
 * so connecting Slack later works without redeploying.
 */
export async function sendSlackRateLimitNotification(
  userId: string,
  senderEmail: string,
  limit: number,
  deferredCount: number
): Promise<void> {
  try {
    const integration = await prisma.slackIntegration.findUnique({
      where: { userId },
    });

    // If user hasn't connected Slack, skip silently
    if (!integration || !integration.webhookUrl) {
      console.log('[Slack] No Slack integration found for user, skipping notification');
      return;
    }

    const payload = {
      text: `⚠️ *Rate Limit Hit* — Sender \`${senderEmail}\``,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '⚠️ Email Rate Limit Reached',
            emoji: true,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Sender:*\n${senderEmail}`,
            },
            {
              type: 'mrkdwn',
              text: `*Hourly Limit:*\n${limit} emails/hour`,
            },
            {
              type: 'mrkdwn',
              text: `*Emails Deferred:*\n${deferredCount}`,
            },
            {
              type: 'mrkdwn',
              text: `*Action:*\nEmails moved to next hour window`,
            },
          ],
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Triggered at ${new Date().toISOString()}`,
            },
          ],
        },
      ],
    };

    const response = await fetch(integration.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error('[Slack] Failed to send notification:', response.statusText);
    } else {
      console.log('[Slack] Rate limit notification sent successfully');
    }
  } catch (err: any) {
    console.error('[Slack] Error sending notification:', err.message);
    // Don't throw — Slack failures should not block email processing
  }
}
