import dayjs from 'dayjs';
import { Fine, Loan, Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { ConflictError, ForbiddenError, NotFoundError } from '../utils/errors';
import { getBookByIsbn } from '../repositories/bookRepository';
import { findMemberByUserId } from '../repositories/memberRepository';
import { getFineById, markFinePaid } from '../repositories/fineRepository';

const DAILY_FINE = 1; // Assumption: $1 per overdue day

/**
 * Allows a member to borrow a book by ISBN when inventory permits.
 * @param userId Authenticated user identifier.
 * @param isbn Book ISBN to borrow.
 * @returns Promise resolving to created loan.
 * @throws {NotFoundError} When member or book is missing.
 * @throws {ConflictError} When no copies are available.
 */
export async function borrowBook(userId: number, isbn: string): Promise<Loan> {
  const member = await findMemberByUserId(userId);
  if (!member) {
    throw new NotFoundError('Member profile not found');
  }

  const book = await getBookByIsbn(isbn);
  if (!book) {
    throw new NotFoundError('Book not found');
  }

  if (book.copiesAvailable <= 0) {
    throw new ConflictError('No copies available to borrow');
  }

  const borrowDate = new Date();
  const dueDate = dayjs(borrowDate).add(14, 'day').toDate();

  // Use transaction to keep inventory and loan creation consistent.
  const loan = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const updated = await tx.book.updateMany({
      where: { isbn, copiesAvailable: { gt: 0 } },
      data: { copiesAvailable: { decrement: 1 } }
    });

    // If no row was updated, inventory was consumed between check and transaction.
    if (updated.count === 0) {
      throw new ConflictError('No copies available to borrow');
    }

    return tx.loan.create({
      data: {
        isbn,
        memberId: member.memberId,
        borrowDate,
        dueDate
      }
    });
  });

  // Any pending reservation by this member for the same book is marked fulfilled.
  await prisma.reservation.updateMany({
    where: { memberId: member.memberId, isbn, status: 'Pending' },
    data: { status: 'Fulfilled' }
  });

  return loan;
}

/**
 * Allows a member or admin to return a book and handles fines for overdue returns.
 * @param params Parameters including user id, loan id, and admin flag.
 * @returns Promise resolving to updated loan and optional fine.
 * @throws {NotFoundError} When loan is missing.
 * @throws {ConflictError} When loan was already returned.
 * @throws {ForbiddenError} When a member tries to return someone else's loan.
 */
export async function returnBook(params: {
  userId: number;
  loanId: number;
  isAdmin: boolean;
}): Promise<{ loan: Loan; fine?: Fine }> {
  const member = params.isAdmin ? null : await findMemberByUserId(params.userId);
  const loan = await prisma.loan.findUnique({ where: { loanId: params.loanId } });

  if (!loan) {
    throw new NotFoundError('Loan not found');
  }

  if (!params.isAdmin) {
    if (!member) {
      throw new NotFoundError('Member profile not found');
    }
    if (loan.memberId !== member.memberId) {
      throw new ForbiddenError('Cannot return loans owned by other members');
    }
  }

  if (loan.returnDate) {
    throw new ConflictError('Loan already returned');
  }

  const returnDate = new Date();
  const isOverdue = dayjs(returnDate).isAfter(dayjs(loan.dueDate), 'day');

  const { updatedLoan, fine } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const updatedLoan = await tx.loan.update({
      where: { loanId: params.loanId },
      data: { returnDate }
    });

    // Replenish inventory now that the book is back.
    await tx.book.update({
      where: { isbn: loan.isbn },
      data: { copiesAvailable: { increment: 1 } }
    });

    let fine: Fine | null = null;

    if (isOverdue) {
      const daysLate = dayjs(returnDate).diff(dayjs(loan.dueDate), 'day');
      const fineAmount = Math.max(0, daysLate) * DAILY_FINE;

      // Avoid duplicate fines for the same loan.
      const existingFine = await tx.fine.findUnique({ where: { loanId: loan.loanId } });

      if (!existingFine) {
        fine = await tx.fine.create({
          data: {
            loanId: loan.loanId,
            memberId: loan.memberId,
            fineAmount,
            fineDate: returnDate,
            paymentStatus: 'Pending'
          }
        });
      } else {
        fine = existingFine;
      }
    }

    return { updatedLoan, fine: fine ?? undefined };
  });

  return { loan: updatedLoan, fine };
}

/**
 * Retrieves loans that belong to the authenticated member.
 * @param userId Authenticated user's id.
 * @returns Promise resolving to loans.
 * @throws {NotFoundError} When member profile is missing.
 */
export async function listMyLoans(userId: number): Promise<Loan[]> {
  const member = await findMemberByUserId(userId);
  if (!member) {
    throw new NotFoundError('Member profile not found');
  }

  return prisma.loan.findMany({ where: { memberId: member.memberId } });
}

/**
 * Allows admin to mark fine as paid when a return triggers it.
 * @param fineId Identifier of the fine.
 * @returns Promise resolving to paid fine.
 * @throws {NotFoundError} When fine is missing.
 */
export async function settleFine(fineId: number): Promise<Fine> {
  const fine = await getFineById(fineId);
  if (!fine) {
    throw new NotFoundError('Fine not found');
  }
  return markFinePaid(fineId);
}
