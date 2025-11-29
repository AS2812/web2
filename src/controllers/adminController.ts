import { Request, Response, NextFunction } from 'express';
import { getDashboardStats } from '../services/adminService';
import { sendSuccess } from '../utils/response';

/**
 * Returns aggregate metrics for admins.
 * @param _req Express request.
 * @param res Express response.
 * @param next Express next handler.
 * @returns Promise resolving when response is sent.
 */
export async function adminDashboard(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const stats = await getDashboardStats();
    sendSuccess(res, stats);
  } catch (error) {
    next(error);
  }
}
