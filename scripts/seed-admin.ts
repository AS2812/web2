import { prisma } from '../src/utils/prisma';
import { hashPassword } from '../src/utils/password';
import { info, error as logError } from '../src/utils/logger';

const username = process.env.ADMIN_USERNAME || 'admin';
const password = process.env.ADMIN_PASSWORD || 'AdminPass123!';
const email = process.env.ADMIN_EMAIL || 'admin@example.com';

/**
 * Seeds a default admin user if one does not already exist.
 * @returns Promise resolving when the seed operation completes.
 */
async function main(): Promise<void> {
  const existing = await prisma.user.findFirst({ where: { username } });
  if (existing) {
    info('Admin user already exists, skipping seed');
    return;
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.create({
    data: {
      username,
      email,
      passwordHash,
      userRole: 'Admin',
      admin: {
        create: {}
      }
    }
  });
  info(`Admin user ${username} created`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    logError('Failed to seed admin', err);
    await prisma.$disconnect();
    process.exit(1);
  });
