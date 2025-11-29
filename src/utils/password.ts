import bcrypt from 'bcryptjs';
import { getConfig } from './config';

const { bcryptRounds } = getConfig();

/**
 * Hashes a plaintext password using bcrypt.
 * @param password Plaintext password.
 * @returns Promise resolving to hashed password.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, bcryptRounds);
}

/**
 * Compares a plaintext password to a hash.
 * @param password Plaintext password.
 * @param hash Stored bcrypt hash.
 * @returns Promise resolving to boolean indicating match.
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
