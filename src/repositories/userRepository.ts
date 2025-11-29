import { User } from '@prisma/client';
import { prisma } from '../utils/prisma';

/**
 * Finds a user by username.
 * @param username Username to search.
 * @returns Promise resolving to user or null.
 */
export async function findUserByUsername(username: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { username } });
}

/**
 * Finds a user by email.
 * @param email Email address to search.
 * @returns Promise resolving to user or null.
 */
export async function findUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { email } });
}

/**
 * Finds a user by primary key.
 * @param userId User identifier.
 * @returns Promise resolving to user or null.
 */
export async function findUserById(userId: number): Promise<User | null> {
  return prisma.user.findUnique({ where: { userId } });
}

/**
 * Persists a new user.
 * @param data User creation payload.
 * @returns Promise resolving to created user.
 */
export async function createUser(data: {
  username: string;
  email: string;
  passwordHash: string;
  userRole: 'Member' | 'Admin';
}): Promise<User> {
  return prisma.user.create({ data });
}
