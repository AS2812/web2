import { AdminUser } from '@prisma/client';
import { prisma } from '../utils/prisma';

/**
 * Creates an admin record for a user.
 * @param userId Identifier of the user.
 * @returns Promise resolving to created admin row.
 */
export async function createAdmin(userId: number): Promise<AdminUser> {
  return prisma.adminUser.create({ data: { userId } });
}

/**
 * Finds an admin record by user id.
 * @param userId Identifier of the user.
 * @returns Promise resolving to admin or null.
 */
export async function findAdminByUserId(userId: number): Promise<AdminUser | null> {
  return prisma.adminUser.findUnique({ where: { userId } });
}
