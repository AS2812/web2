import { Reservation } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { ConflictError, ForbiddenError, NotFoundError } from '../utils/errors';
import { findMemberByUserId } from '../repositories/memberRepository';
import { getBookByIsbn } from '../repositories/bookRepository';

/**
 * Creates a reservation for the authenticated member.
 * @param userId Authenticated user identifier.
 * @param isbn Book ISBN to reserve.
 * @returns Promise resolving to created reservation.
 * @throws {NotFoundError} When member or book is missing.
 * @throws {ConflictError} When a duplicate active reservation exists.
 */
export async function createMemberReservation(userId: number, isbn: string): Promise<Reservation> {
  const member = await findMemberByUserId(userId);
  if (!member) {
    throw new NotFoundError('Member profile not found');
  }

  const book = await getBookByIsbn(isbn);
  if (!book) {
    throw new NotFoundError('Book not found');
  }

  try {
    return await prisma.reservation.create({
      data: {
        isbn,
        memberId: member.memberId,
        reservationDate: new Date(),
        status: 'Pending'
      }
    });
  } catch (error: unknown) {
    const message = (error as { code?: string }).code;
    if (message === 'P2002') {
      throw new ConflictError('An active reservation already exists for this book');
    }
    throw error;
  }
}

/**
 * Cancels a reservation that belongs to the member.
 * @param userId Authenticated user identifier.
 * @param reservationId Reservation identifier.
 * @returns Promise resolving to cancelled reservation.
 * @throws {NotFoundError} When reservation not found.
 * @throws {ForbiddenError} When reservation does not belong to the member.
 */
export async function cancelMemberReservation(
  userId: number,
  reservationId: number
): Promise<Reservation> {
  const member = await findMemberByUserId(userId);
  if (!member) {
    throw new NotFoundError('Member profile not found');
  }

  const reservation = await prisma.reservation.findUnique({ where: { reservationId } });
  if (!reservation) {
    throw new NotFoundError('Reservation not found');
  }

  if (reservation.memberId !== member.memberId) {
    throw new ForbiddenError('Cannot cancel reservations of other members');
  }

  return prisma.reservation.update({
    where: { reservationId },
    data: { status: 'Cancelled' }
  });
}

/**
 * Retrieves reservations for the authenticated member.
 * @param userId Authenticated user identifier.
 * @returns Promise resolving to reservation list.
 * @throws {NotFoundError} When member record is missing.
 */
export async function listMyReservations(userId: number): Promise<Reservation[]> {
  const member = await findMemberByUserId(userId);
  if (!member) {
    throw new NotFoundError('Member profile not found');
  }

  return prisma.reservation.findMany({ where: { memberId: member.memberId } });
}
