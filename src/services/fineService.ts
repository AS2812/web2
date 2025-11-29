import { Fine } from '@prisma/client';
import { findMemberByUserId } from '../repositories/memberRepository';
import { getFineById, listFinesByMember, markFinePaid } from '../repositories/fineRepository';
import { ForbiddenError, NotFoundError } from '../utils/errors';

/**
 * Lists fines for the authenticated member.
 * @param userId Authenticated user id.
 * @returns Promise resolving to fines.
 * @throws {NotFoundError} When member profile is missing.
 */
export async function listMyFines(userId: number): Promise<Fine[]> {
  const member = await findMemberByUserId(userId);
  if (!member) {
    throw new NotFoundError('Member profile not found');
  }
  return listFinesByMember(member.memberId);
}

/**
 * Marks a fine as paid.
 * @param params Fine settlement parameters.
 * @returns Promise resolving to updated fine.
 * @throws {NotFoundError} When fine is missing.
 * @throws {ForbiddenError} When member attempts to pay another member's fine.
 */
export async function payFine(params: {
  fineId: number;
  userId: number;
  isAdmin: boolean;
}): Promise<Fine> {
  const fine = await getFineById(params.fineId);
  if (!fine) {
    throw new NotFoundError('Fine not found');
  }

  if (!params.isAdmin) {
    const member = await findMemberByUserId(params.userId);
    if (!member) {
      throw new NotFoundError('Member profile not found');
    }
    if (fine.memberId !== member.memberId) {
      throw new ForbiddenError('Cannot pay fines belonging to other members');
    }
  }

  return markFinePaid(params.fineId);
}
