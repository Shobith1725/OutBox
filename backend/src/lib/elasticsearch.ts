import { Client } from '@elastic/elasticsearch';
import { config } from '../config';
import prisma from './prisma';

// Elasticsearch is optional in production (no free hosting available)
let esClient: Client | null = null;
let esAvailable = false;

if (config.elasticsearchUrl) {
  esClient = new Client({ node: config.elasticsearchUrl });
}

const INDEX_NAME = 'emails';

/**
 * Check if Elasticsearch is reachable.
 */
async function checkES(): Promise<boolean> {
  if (!esClient) return false;
  try {
    await esClient.ping();
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure the emails index exists with proper mappings.
 */
export async function ensureIndex(): Promise<void> {
  if (!esClient) {
    console.log('[ES] Elasticsearch not configured — using Postgres fallback for search');
    return;
  }

  try {
    const reachable = await checkES();
    if (!reachable) {
      console.log('[ES] Elasticsearch not reachable — using Postgres fallback for search');
      return;
    }

    const exists = await esClient.indices.exists({ index: INDEX_NAME });
    if (!exists) {
      await esClient.indices.create({
        index: INDEX_NAME,
        body: {
          mappings: {
            properties: {
              recipient: { type: 'text', fields: { keyword: { type: 'keyword' } } },
              subject: { type: 'text' },
              status: { type: 'keyword' },
              scheduledAt: { type: 'date' },
              sentAt: { type: 'date' },
              senderId: { type: 'keyword' },
              campaignId: { type: 'keyword' },
              senderEmail: { type: 'keyword' },
              body: { type: 'text' },
            },
          },
        },
      });
      console.log('[ES] Created "emails" index');
    }
    esAvailable = true;
    console.log('[ES] Index ready');
  } catch (err: any) {
    if (err?.meta?.body?.error?.type !== 'resource_already_exists_exception') {
      console.error('[ES] Error creating index:', err.message);
      console.log('[ES] Falling back to Postgres search');
    } else {
      esAvailable = true;
      console.log('[ES] Index ready');
    }
  }
}

/**
 * Index or upsert a single email document. No-op if ES unavailable.
 */
export async function indexEmail(doc: {
  id: string;
  recipient: string;
  subject: string;
  status: string;
  scheduledAt: string;
  sentAt?: string | null;
  senderId: string;
  campaignId: string;
  senderEmail?: string;
  body?: string;
}): Promise<void> {
  if (!esClient || !esAvailable) return;

  try {
    await esClient.index({
      index: INDEX_NAME,
      id: doc.id,
      body: {
        recipient: doc.recipient,
        subject: doc.subject,
        status: doc.status,
        scheduledAt: doc.scheduledAt,
        sentAt: doc.sentAt || null,
        senderId: doc.senderId,
        campaignId: doc.campaignId,
        senderEmail: doc.senderEmail || '',
        body: doc.body || '',
      },
      refresh: true,
    });
  } catch (err: any) {
    console.error('[ES] Error indexing email:', err.message);
  }
}

/**
 * Search emails — uses Elasticsearch if available, falls back to Postgres ILIKE.
 */
export async function searchEmails(
  query: string,
  page: number = 1,
  pageSize: number = 20
): Promise<{ hits: any[]; total: number }> {
  // Postgres fallback when ES is unavailable
  if (!esClient || !esAvailable) {
    return searchEmailsPostgres(query, page, pageSize);
  }

  try {
    const from = (page - 1) * pageSize;
    const result = await esClient.search({
      index: INDEX_NAME,
      body: {
        from,
        size: pageSize,
        query: {
          multi_match: {
            query,
            fields: ['subject', 'recipient', 'status', 'senderEmail', 'body'],
            type: 'best_fields',
            fuzziness: 'AUTO',
          },
        },
        sort: [{ scheduledAt: { order: 'desc' } }],
      },
    });

    const hits = (result.hits.hits || []).map((hit: any) => ({
      id: hit._id,
      ...hit._source,
      _score: hit._score,
    }));

    const total =
      typeof result.hits.total === 'number'
        ? result.hits.total
        : result.hits.total?.value || 0;

    return { hits, total };
  } catch (err: any) {
    console.error('[ES] Search error, falling back to Postgres:', err.message);
    return searchEmailsPostgres(query, page, pageSize);
  }
}

/**
 * Postgres-based search fallback using ILIKE.
 */
async function searchEmailsPostgres(
  query: string,
  page: number,
  pageSize: number
): Promise<{ hits: any[]; total: number }> {
  const skip = (page - 1) * pageSize;

  const where: any = {
    OR: [
      { recipientEmail: { contains: query, mode: 'insensitive' } },
      { campaign: { subject: { contains: query, mode: 'insensitive' } } },
      { campaign: { body: { contains: query, mode: 'insensitive' } } },
    ],
  };

  const [emails, total] = await Promise.all([
    prisma.scheduledEmail.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { scheduledAt: 'desc' },
      include: {
        campaign: {
          include: { sender: true },
        },
      },
    }),
    prisma.scheduledEmail.count({ where }),
  ]);

  const hits = emails.map((e: any) => ({
    id: e.id,
    recipient: e.recipientEmail,
    subject: e.campaign?.subject || '',
    body: e.campaign?.body || '',
    status: e.status,
    scheduledAt: e.scheduledAt,
    sentAt: e.sentAt,
    senderId: e.campaign?.senderId || '',
    campaignId: e.campaignId,
    senderEmail: e.campaign?.sender?.fromEmail || '',
  }));

  return { hits, total };
}

export { esClient, esAvailable };
