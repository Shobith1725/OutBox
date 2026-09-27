import { Router } from 'express';
import passport from '../auth/passport';
import { config } from '../config';
import { requireAuth } from '../auth/middleware';
import prisma from '../lib/prisma';

const router = Router();

// Initiate Google OAuth
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
  })
);

// Google OAuth callback
router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${config.frontendUrl}/login?error=auth_failed`,
  }),
  (_req, res) => {
    // Successful login — redirect to frontend dashboard
    res.redirect(`${config.frontendUrl}/dashboard`);
  }
);

// Direct Email/Password login or registration
router.post('/login', async (req, res) => {
  const { email } = req.body;

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }

  const cleanEmail = email.toLowerCase().trim();

  try {
    let user = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          googleId: `local_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          email: cleanEmail,
          name: cleanEmail.split('@')[0],
        },
      });
      console.log(`[Auth] Created email user: ${cleanEmail}`);
    }

    req.login(user, (err) => {
      if (err) {
        console.error('[Auth] req.login error:', err);
        return res.status(500).json({ error: 'Session creation failed' });
      }

      res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      });
    });
  } catch (err: any) {
    console.error('[Auth] Login error:', err.message);
    res.status(500).json({ error: 'Login failed', details: err.message });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    req.session.destroy((sessionErr) => {
      if (sessionErr) {
        console.error('Session destroy error:', sessionErr);
      }
      res.clearCookie('connect.sid');
      res.json({ message: 'Logged out successfully' });
    });
  });
});

// Get current user
router.get('/me', requireAuth, (req, res) => {
  const user = req.user as any;
  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
  });
});

export default router;
