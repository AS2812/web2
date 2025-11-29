import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { UnauthorizedError } from '../utils/errors';

/**
 * Middleware that validates JWT bearer tokens and attaches user context.
 * @param req Express request with Authorization header.
 * @param _res Express response (unused).
 * @param next Express next function.
 * @returns Calls next when token is valid.
 * @throws {UnauthorizedError} When token is missing or invalid.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid Authorization header');
  }

  try {
    const token = header.split(' ')[1];
    const payload = verifyToken(token);
    req.user = { id: payload.userId, role: payload.role };
    next();
  } catch (error) {
    throw new UnauthorizedError('Invalid token');
  }
}
