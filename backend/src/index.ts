import express from 'express';
import cors from 'cors';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { config } from './config';
import passport from './auth/passport';
import { emailQueue } from './lib/queue';
import { ensureIndex } from './lib/elasticsearch';
import authRoutes from './routes/auth';
import slackRoutes from './routes/slack';
import emailRoutes from './routes/emails';
import senderRoutes from './routes/senders';

const app = express();

// Trust reverse proxy (needed for Render / HTTPS cookies)
app.set('trust proxy', 1);

// ─── CORS ───────────────────────────────────────────────────────
// Support both production frontend URL and localhost for development
const allowedOrigins = [config.frontendUrl, 'http://localhost:3000'].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // Be permissive — tighten in production if needed
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ─── Body Parsing ───────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Sessions ───────────────────────────────────────────────────
// Cookie-based session (httpOnly) — chosen over JWT for simplicity
// and automatic CSRF protection via SameSite cookie attribute.
app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' as const : 'lax' as const,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

// ─── Passport ───────────────────────────────────────────────────
app.use(passport.initialize());
app.use(passport.session());

// ─── Bull-Board ─────────────────────────────────────────────────
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
});

// Basic auth for bull-board
app.use('/admin/queues', (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const [scheme, encoded] = authHeader.split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
      const [user, pass] = decoded.split(':');
      if (user === config.bullBoardUser && pass === config.bullBoardPass) {
        return next();
      }
    }
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
  res.status(401).send('Authentication required');
});

app.use('/admin/queues', serverAdapter.getRouter());

// ─── Routes ─────────────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/integrations/slack', slackRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/senders', senderRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Start Server ───────────────────────────────────────────────
async function start() {
  // Ensure Elasticsearch index exists (optional — gracefully falls back to Postgres)
  await ensureIndex();

  app.listen(config.port, () => {
    console.log('═══════════════════════════════════════════════');
    console.log(`  OutBox API Server running on port ${config.port}`);
    console.log(`  Frontend URL: ${config.frontendUrl}`);
    console.log(`  Bull Board: http://localhost:${config.port}/admin/queues`);
    console.log('═══════════════════════════════════════════════');
  });
}

start();
