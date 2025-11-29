import { Reservation } from '@prisma/client';
import { prisma } from '../utils/prisma';

/**
 * Creates a reservation.
 * @param data Reservation creation payload.
 * @returns Promise resolving to created reservation.
 */
export async function createReservation(data: {
  isbn: string;
  memberId: number;
  reservationDate: Date;
  status?: string;
}): Promise<Reservation> {
  return prisma.reservation.create({ data });
}

/**
 * Finds reservations for a member.
 * @param memberId Member identifier.
 * @returns Promise resolving to reservation list.
 */
export async function listReservationsByMember(memberId: number): Promise<Reservation[]> {
  return prisma.reservation.findMany({ where: { memberId } });
}

/**
 * Retrieves reservation by id.
 * @param reservationId Reservation identifier.
 * @returns Promise resolving to reservation or null.
 */
export async function getReservationById(reservationId: number): Promise<Reservation | null> {
  return prisma.reservation.findUnique({ where: { reservationId } });
}

/**
 * Cancels a reservation by marking status cancelled.
 * @param reservationId Reservation identifier.
 * @returns Promise resolving to updated reservation.
 */
export async function cancelReservation(reservationId: number): Promise<Reservation> {
  return prisma.reservation.update({
    where: { reservationId },
    data: { status: 'Cancelled' }
  });
}

/**
 * Updates reservation status.
 * @param reservationId Reservation identifier.
 * @param status New status value.
 * @returns Promise resolving to updated reservation.
 */
export async function updateReservationStatus(
  reservationId: number,
  status: string
): Promise<Reservation> {
  return prisma.reservation.update({ where: { reservationId }, data: { status } });
}
