import { Request, Response, NextFunction } from 'express';
import { listMyFines, payFine } from '../services/fineService';
import { sendSuccess } from '../utils/response';

/**
 * Lists fines for the current member.
 * @param req Express request.
 * @param res Express response.
 * @param next Express next handler.
 * @returns Promise resolving when response is sent.
 */
export async function listMyFinesController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const fines = await listMyFines(req.user!.id);
    sendSuccess(res, fines);
  } catch (error) {
    next(error);
  }
}

/**
 * Pays a fine if the member owns it or the caller is an admin.
 * @param req Express request containing fine id.
 * @param res Express response.
 * @param next Express next handler.
 * @returns Promise resolving when response is sent.
 */
export async function payFineController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const fine = await payFine({
      fineId: Number(req.params.id),
      userId: req.user!.id,
      isAdmin: req.user!.role === 'Admin'
    });
    sendSuccess(res, fine);
  } catch (error) {
    next(error);
  }
}
