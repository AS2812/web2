import { Loan, Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';

/**
 * Creates a loan record.
 * @param data Loan creation payload.
 * @returns Promise resolving to created loan.
 */
export async function createLoan(data: Prisma.LoanCreateInput): Promise<Loan> {
  return prisma.loan.create({ data });
}

/**
 * Retrieves a loan by identifier.
 * @param loanId Loan identifier.
 * @returns Promise resolving to loan or null.
 */
export async function getLoanById(loanId: number): Promise<Loan | null> {
  return prisma.loan.findUnique({ where: { loanId } });
}

/**
 * Retrieves loans for a member.
 * @param memberId Member identifier.
 * @returns Promise resolving to member loans.
 */
export async function listLoansByMember(memberId: number): Promise<Loan[]> {
  return prisma.loan.findMany({ where: { memberId } });
}

/**
 * Updates a loan's return date.
 * @param loanId Loan identifier.
 * @param returnDate Date of return.
 * @returns Promise resolving to updated loan.
 */
export async function setReturnDate(loanId: number, returnDate: Date): Promise<Loan> {
  return prisma.loan.update({ where: { loanId }, data: { returnDate } });
}
