import nodemailer from 'nodemailer';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed script: creates N Ethereal test accounts and stores them as Senders.
 * 
 * Each Sender gets real, distinct Ethereal SMTP credentials so
 * "multiple senders" is genuinely multiple SMTP identities.
 * 
 * Usage: npm run seed
 * 
 * Ethereal accounts are disposable and re-generatable.
 * Run this script once after initial setup, or re-run to regenerate.
 */
async function seedSenders() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Seeding Ethereal Test Senders');
  console.log('═══════════════════════════════════════════════');

  // Find the first user (single-tenant assumption)
  // Prefer the real Google-authenticated user; fall back to placeholder
  let user = await prisma.user.findFirst({
    where: { googleId: { not: 'placeholder-seed-user' } },
  });

  if (!user) {
    user = await prisma.user.findFirst();
  }

  if (!user) {
    console.log('[Seed] No user found. Creating placeholder user...');
    user = await prisma.user.create({
      data: {
        googleId: 'placeholder-seed-user',
        email: 'admin@outbox.local',
        name: 'OutBox Admin',
        avatar: null,
      },
    });
  }

  console.log(`[Seed] Using user: ${user.email}`);

  const senderNames = [
    { displayName: 'Sales Team', prefix: 'sales' },
    { displayName: 'Marketing', prefix: 'marketing' },
    { displayName: 'Support', prefix: 'support' },
  ];

  for (const senderInfo of senderNames) {
    console.log(`\n[Seed] Creating Ethereal account for "${senderInfo.displayName}"...`);

    try {
      // Create a real Ethereal test account
      const testAccount = await nodemailer.createTestAccount();

      // Check if sender already exists for this user
      const existing = await prisma.sender.findFirst({
        where: {
          userId: user.id,
          displayName: senderInfo.displayName,
        },
      });

      if (existing) {
        // Update existing sender with fresh credentials
        await prisma.sender.update({
          where: { id: existing.id },
          data: {
            fromEmail: testAccount.user,
            smtpHost: testAccount.smtp.host,
            smtpPort: testAccount.smtp.port,
            smtpUser: testAccount.user,
            smtpPass: testAccount.pass,
          },
        });
        console.log(`  ✓ Updated: ${senderInfo.displayName}`);
      } else {
        // Create new sender
        await prisma.sender.create({
          data: {
            userId: user.id,
            displayName: senderInfo.displayName,
            fromEmail: testAccount.user,
            smtpHost: testAccount.smtp.host,
            smtpPort: testAccount.smtp.port,
            smtpUser: testAccount.user,
            smtpPass: testAccount.pass,
          },
        });
        console.log(`  ✓ Created: ${senderInfo.displayName}`);
      }

      console.log(`    Email: ${testAccount.user}`);
      console.log(`    SMTP:  ${testAccount.smtp.host}:${testAccount.smtp.port}`);
      console.log(`    Web:   https://ethereal.email/login`);
      console.log(`    User:  ${testAccount.user}`);
      console.log(`    Pass:  ${testAccount.pass}`);
    } catch (err: any) {
      console.error(`  ✗ Failed for ${senderInfo.displayName}:`, err.message);
    }
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log('  Seeding complete! Run the server to start.');
  console.log('═══════════════════════════════════════════════');

  await prisma.$disconnect();
}

seedSenders().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
