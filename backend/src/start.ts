/**
 * Combined production entry point — runs both the API server and
 * the BullMQ worker in the same process.
 *
 * In development, they run as separate processes (npm run dev + npm run worker).
 * In production on Render free tier, we combine them to avoid needing
 * a separate Background Worker service ($7/month).
 */
import './index';
import { startWorker } from './worker';

// Start the worker alongside the API server
startWorker().catch((err) => {
  console.error('[Worker] Fatal error in combined mode:', err);
});
