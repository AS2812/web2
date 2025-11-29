import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/errors';
import { sendError } from '../utils/response';
import { info } from '../utils/logger';

/**
 * Express error handler producing consistent API responses.
 * @param err Error thrown in the request pipeline.
 * @param _req Express request.
 * @param res Express response.
 * @param _next Express next function.
 * @returns Response with standardized error body.
 */
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    info('Handled application error', { code: err.code, message: err.message });
    return sendError(res, err);
  }

  const unexpected = new AppError(err.message || 'Unexpected error', 500, 'INTERNAL_ERROR');
  return sendError(res, unexpected);
}
