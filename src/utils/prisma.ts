import { PrismaClient } from '@prisma/client';
import { info } from './logger';

export const prisma = new PrismaClient();

/**
 * Gracefully closes Prisma connections.
 * @returns Promise that resolves when Prisma disconnects.
 */
export async function shutdownPrisma(): Promise<void> {
  await prisma.$disconnect();
  info('Prisma disconnected');
}
