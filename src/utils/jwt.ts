import jwt from 'jsonwebtoken';
import type { Secret, SignOptions } from 'jsonwebtoken';
import { getConfig } from './config';

const { jwtSecret: rawJwtSecret, jwtExpiry: rawJwtExpiry } = getConfig();

// Strong typing so jwt.sign / jwt.verify overloads work in TS
const jwtSecret: Secret = rawJwtSecret as unknown as Secret;
const jwtExpiry: SignOptions['expiresIn'] =
  rawJwtExpiry as unknown as SignOptions['expiresIn'];

export type JwtPayload = {
  userId: number;
  role: string;
};

/**
 * Generates a signed JWT for the supplied payload.
 * @param payload Data to embed in token.
 * @returns Signed JWT string.
 */
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, jwtSecret, { expiresIn: jwtExpiry });
}

/**
 * Verifies a JWT and returns its payload.
 * @param token JWT string to verify.
 * @returns Decoded payload if valid.
 * @throws {jwt.JsonWebTokenError} When token is invalid.
 */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, jwtSecret) as JwtPayload;
}
