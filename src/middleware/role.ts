import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../utils/errors';

/**
 * Middleware factory enforcing role-based access.
 * @param allowedRoles Roles permitted to access the route.
 * @returns Express middleware that verifies the user's role.
 * @throws {ForbiddenError} When the requester lacks required role.
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      throw new ForbiddenError('Insufficient permissions');
    }
    next();
  };
}
