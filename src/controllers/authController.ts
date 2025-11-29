import { Request, Response, NextFunction } from 'express';
import { getProfile, login, registerMember } from '../services/authService';
import { sendSuccess } from '../utils/response';

/**
 * Handles member registration.
 * @param req Express request containing registration payload.
 * @param res Express response.
 * @param next Express next handler.
 * @returns Promise resolving when response is sent.
 */
export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { username, email, password, name, address } = req.body;
    const result = await registerMember({ username, email, password, name, address });
    sendSuccess(res, result, 201);
  } catch (error) {
    next(error);
  }
}

/**
 * Handles user login flow.
 * @param req Express request containing login payload.
 * @param res Express response.
 * @param next Express next handler.
 * @returns Promise resolving when response is sent.
 */
export async function loginUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { username, password } = req.body;
    const result = await login(username, password);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}

/**
 * Returns authenticated user's profile information.
 * @param req Express request containing user context.
 * @param res Express response.
 * @param next Express next handler.
 * @returns Promise resolving when response is sent.
 */
export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await getProfile(req.user!.id);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}
