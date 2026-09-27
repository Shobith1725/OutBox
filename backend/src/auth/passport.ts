import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { config } from '../config';
import prisma from '../lib/prisma';

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

passport.use(
  new GoogleStrategy(
    {
      clientID: config.googleClientId,
      clientSecret: config.googleClientSecret,
      callbackURL: config.googleCallbackUrl,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value || '';
        const avatar = profile.photos?.[0]?.value || null;

        // Upsert user — create if first login, find if returning
        let user = await prisma.user.findUnique({
          where: { googleId: profile.id },
        });

        if (!user) {
          user = await prisma.user.create({
            data: {
              googleId: profile.id,
              email,
              name: profile.displayName || email,
              avatar,
            },
          });
          console.log(`[Auth] New user created: ${email}`);

          // Single-tenant: transfer senders from placeholder seed user to real user
          const placeholder = await prisma.user.findUnique({
            where: { googleId: 'placeholder-seed-user' },
          });
          if (placeholder) {
            await prisma.sender.updateMany({
              where: { userId: placeholder.id },
              data: { userId: user.id },
            });
            await prisma.user.delete({ where: { id: placeholder.id } });
            console.log(`[Auth] Transferred senders from placeholder to ${email}`);
          }
        } else {
          // Update avatar/name on each login
          user = await prisma.user.update({
            where: { id: user.id },
            data: {
              name: profile.displayName || user.name,
              avatar: avatar || user.avatar,
            },
          });
        }

        done(null, user);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  )
);

export default passport;
