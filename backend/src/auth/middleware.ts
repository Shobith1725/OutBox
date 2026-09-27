import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to check if user is authenticated.
 * Works with cookie-based sessions (Passport.js).
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.isAuthenticated && req.isAuthenticated() && req.user) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized. Please log in.' });
}
