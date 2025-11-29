import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { TooManyRequestsError } from '../utils/errors';

/**
 * Rate limit handler that converts rate limit errors to AppError.
 * @param message Error message to surface when limited.
 * @returns Express middleware enforcing rate limits.
 */
export function authRateLimiter(message = 'Too many attempts, please try again later') {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, _res: Response, next: NextFunction) => {
      next(new TooManyRequestsError(message));
    }
  });
}
