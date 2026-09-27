import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth/middleware';
import { config } from '../config';
import prisma from '../lib/prisma';

const router = Router();

/**
 * Initiate Slack OAuth — redirects to Slack's authorization page.
 * Scopes: incoming-webhook for posting notifications.
 */
router.get('/connect', requireAuth, (req: Request, res: Response) => {
  const user = req.user as any;

  const slackAuthUrl = new URL('https://slack.com/oauth/v2/authorize');
  slackAuthUrl.searchParams.set('client_id', config.slackClientId);
  slackAuthUrl.searchParams.set('scope', 'incoming-webhook,chat:write');
  slackAuthUrl.searchParams.set('redirect_uri', config.slackRedirectUri);
  slackAuthUrl.searchParams.set('state', user.id); // Pass userId in state for callback

  res.redirect(slackAuthUrl.toString());
});

/**
 * Slack OAuth callback — exchanges code for access token + webhook URL.
 */
router.get('/callback', requireAuth, async (req: Request, res: Response) => {
  const { code, state } = req.query;
  const user = req.user as any;

  if (!code) {
    return res.redirect(`${config.frontendUrl}/dashboard?slack=error&reason=no_code`);
  }

  try {
    // Exchange authorization code for access token
    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.slackClientId,
        client_secret: config.slackClientSecret,
        code: code as string,
        redirect_uri: config.slackRedirectUri,
      }),
    });

    const data = (await response.json()) as any;

    if (!data.ok) {
      console.error('[Slack] OAuth error:', data.error);
      return res.redirect(`${config.frontendUrl}/dashboard?slack=error&reason=${data.error}`);
    }

    // Store/update Slack integration
    await prisma.slackIntegration.upsert({
      where: { userId: user.id },
      update: {
        teamId: data.team?.id || null,
        teamName: data.team?.name || null,
        accessToken: data.access_token || null,
        webhookUrl: data.incoming_webhook?.url || null,
        channelId: data.incoming_webhook?.channel_id || null,
        channelName: data.incoming_webhook?.channel || null,
        connectedAt: new Date(),
      },
      create: {
        userId: user.id,
        teamId: data.team?.id || null,
        teamName: data.team?.name || null,
        accessToken: data.access_token || null,
        webhookUrl: data.incoming_webhook?.url || null,
        channelId: data.incoming_webhook?.channel_id || null,
        channelName: data.incoming_webhook?.channel || null,
      },
    });

    console.log(`[Slack] Connected for user ${user.email} → team ${data.team?.name}`);
    res.redirect(`${config.frontendUrl}/dashboard?slack=connected`);
  } catch (err: any) {
    console.error('[Slack] Callback error:', err.message);
    res.redirect(`${config.frontendUrl}/dashboard?slack=error&reason=server_error`);
  }
});

/**
 * Disconnect Slack — removes the integration record.
 */
router.post('/disconnect', requireAuth, async (req: Request, res: Response) => {
  const user = req.user as any;

  try {
    await prisma.slackIntegration.delete({
      where: { userId: user.id },
    });
    res.json({ message: 'Slack disconnected successfully' });
  } catch (err: any) {
    // Not found is fine — already disconnected
    if (err.code === 'P2025') {
      return res.json({ message: 'Slack was not connected' });
    }
    console.error('[Slack] Disconnect error:', err.message);
    res.status(500).json({ error: 'Failed to disconnect Slack' });
  }
});

/**
 * Get Slack connection status.
 */
router.get('/status', requireAuth, async (req: Request, res: Response) => {
  const user = req.user as any;

  const integration = await prisma.slackIntegration.findUnique({
    where: { userId: user.id },
  });

  res.json({
    connected: !!integration,
    teamName: integration?.teamName || undefined,
    channelName: integration?.channelName || undefined,
  });
});

export default router;
