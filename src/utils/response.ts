import { Response } from 'express';
import { AppError } from './errors';

export type ApiSuccess<T> = {
  success: true;
  data: T;
  error: null;
};

export type ApiError = {
  success: false;
  data: null;
  error: {
    message: string;
    code: string;
  };
};

/**
 * Sends a standardized success response.
 * @param res Express response instance.
 * @param data Payload to send.
 * @param status HTTP status code.
 * @returns Express response with formatted body.
 */
export function sendSuccess<T>(res: Response, data: T, status = 200): Response<ApiSuccess<T>> {
  return res.status(status).json({ success: true, data, error: null });
}

/**
 * Sends a standardized error response.
 * @param res Express response instance.
 * @param error Application error with status and code.
 * @returns Express response with formatted body.
 */
export function sendError(res: Response, error: AppError): Response<ApiError> {
  return res.status(error.statusCode).json({
    success: false,
    data: null,
    error: { message: error.message, code: error.code }
  });
}
