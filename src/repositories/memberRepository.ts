import { Member } from '@prisma/client';
import { prisma } from '../utils/prisma';

/**
 * Creates a member linked to a user.
 * @param data Member creation payload.
 * @returns Promise resolving to created member.
 */
export async function createMember(data: {
  userId: number;
  memberNumber?: string | null;
  name: string;
  address?: string | null;
  membershipExpiryDate?: Date | null;
}): Promise<Member> {
  return prisma.member.create({ data });
}

/**
 * Finds a member by linked user id.
 * @param userId User identifier.
 * @returns Promise resolving to member or null.
 */
export async function findMemberByUserId(userId: number): Promise<Member | null> {
  return prisma.member.findUnique({ where: { userId } });
}

/**
 * Finds a member by member id.
 * @param memberId Member identifier.
 * @returns Promise resolving to member or null.
 */
export async function findMemberById(memberId: number): Promise<Member | null> {
  return prisma.member.findUnique({ where: { memberId } });
}
