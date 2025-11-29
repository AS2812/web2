import { prisma } from '../utils/prisma';

/**
 * Aggregates simple metrics for admin dashboard.
 * @returns Promise resolving to counts.
 */
export async function getDashboardStats(): Promise<{
  books: number;
  members: number;
  loans: number;
  unpaidFines: number;
}> {
  const [books, members, loans, unpaidFines] = await Promise.all([
    prisma.book.count(),
    prisma.member.count(),
    prisma.loan.count(),
    prisma.fine.count({ where: { paymentStatus: { not: 'Paid' } } })
  ]);

  return { books, members, loans, unpaidFines };
}
