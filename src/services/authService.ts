import { User } from '@prisma/client';
import {
  createUser,
  findUserByEmail,
  findUserById,
  findUserByUsername
} from '../repositories/userRepository';
import { createMember, findMemberByUserId } from '../repositories/memberRepository';
import { hashPassword, comparePassword } from '../utils/password';
import { signToken } from '../utils/jwt';
import { ConflictError, NotFoundError, UnauthorizedError } from '../utils/errors';

/**
 * Removes sensitive fields from a user object.
 * @param user User record from persistence.
 * @returns Sanitized user without password hash.
 */
function stripSensitive(user: User) {
  const { passwordHash, ...rest } = user;
  return rest;
}

/**
 * Registers a new member-level user and linked member profile.
 * @param payload User registration details.
 * @returns JWT token and persisted user metadata.
 * @throws {ConflictError} When username or email already exists.
 */
export async function registerMember(payload: {
  username: string;
  email: string;
  password: string;
  name: string;
  address?: string;
}): Promise<{ token: string; user: Omit<User, 'passwordHash'> }> {
  const existingUsername = await findUserByUsername(payload.username);
  if (existingUsername) {
    throw new ConflictError('Username already taken');
  }

  const existingEmail = await findUserByEmail(payload.email);
  if (existingEmail) {
    throw new ConflictError('Email already registered');
  }

  const passwordHash = await hashPassword(payload.password);
  const user = await createUser({
    username: payload.username,
    email: payload.email,
    passwordHash,
    userRole: 'Member'
  });

  // Member number is generated for traceability.
  const memberNumber = `MEM-${Date.now()}`;
  await createMember({
    userId: user.userId,
    name: payload.name,
    address: payload.address ?? null,
    membershipExpiryDate: null,
    memberNumber
  });

  const token = signToken({ userId: user.userId, role: user.userRole });
  return { token, user: stripSensitive(user) };
}

/**
 * Authenticates a user by username and password.
 * @param username Login username.
 * @param password Plaintext password.
 * @returns JWT token and sanitized user.
 * @throws {UnauthorizedError} When credentials are invalid.
 */
export async function login(
  username: string,
  password: string
): Promise<{ token: string; user: Omit<User, 'passwordHash'> }> {
  const user = await findUserByUsername(username);
  if (!user) {
    throw new UnauthorizedError('Invalid credentials');
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError('Invalid credentials');
  }

  const token = signToken({ userId: user.userId, role: user.userRole });
  return { token, user: stripSensitive(user) };
}

/**
 * Retrieves the authenticated user's profile and member linkage.
 * @param userId Identifier of the authenticated user.
 * @returns User data with member id if present.
 * @throws {NotFoundError} When user is not found.
 */
export async function getProfile(
  userId: number
): Promise<{ user: Omit<User, 'passwordHash'>; memberId?: number }> {
  const user = await findUserById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }
  const member = await findMemberByUserId(userId);
  return { user: stripSensitive(user), memberId: member?.memberId };
}
