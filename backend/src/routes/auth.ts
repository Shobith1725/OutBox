import { Router } from 'express';
import passport from '../auth/passport';
import { config } from '../config';
import { requireAuth } from '../auth/middleware';

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
