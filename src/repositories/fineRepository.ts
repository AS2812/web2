import { Fine } from '@prisma/client';
import { prisma } from '../utils/prisma';

/**
 * Creates a fine for a loan.
 * @param data Fine creation payload.
 * @returns Promise resolving to created fine.
 */
export async function createFine(data: {
  loanId: number;
  memberId: number;
  fineAmount: number;
  fineDate: Date;
  paymentStatus?: string;
}): Promise<Fine> {
  return prisma.fine.create({ data });
}

/**
 * Finds a fine by loan id.
 * @param loanId Loan identifier.
 * @returns Promise resolving to fine or null.
 */
export async function findFineByLoan(loanId: number): Promise<Fine | null> {
  return prisma.fine.findUnique({ where: { loanId } });
}

/**
 * Retrieves fines for a member.
 * @param memberId Member identifier.
 * @returns Promise resolving to fines list.
 */
export async function listFinesByMember(memberId: number): Promise<Fine[]> {
  return prisma.fine.findMany({ where: { memberId } });
}

/**
 * Retrieves a fine by id.
 * @param fineId Fine identifier.
 * @returns Promise resolving to fine or null.
 */
export async function getFineById(fineId: number): Promise<Fine | null> {
  return prisma.fine.findUnique({ where: { fineId } });
}

/**
 * Marks a fine as paid.
 * @param fineId Fine identifier.
 * @returns Promise resolving to updated fine.
 */
export async function markFinePaid(fineId: number): Promise<Fine> {
  return prisma.fine.update({ where: { fineId }, data: { paymentStatus: 'Paid' } });
}
