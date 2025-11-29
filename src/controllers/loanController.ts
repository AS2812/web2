import { Request, Response, NextFunction } from 'express';
import { borrowBook, listMyLoans, returnBook } from '../services/loanService';
import { sendSuccess } from '../utils/response';

/**
 * Creates a loan for the authenticated member.
 * @param req Express request containing ISBN.
 * @param res Express response.
 * @param next Express next handler.
 * @returns Promise resolving when response is sent.
 */
export async function borrowController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const loan = await borrowBook(req.user!.id, req.body.isbn);
    sendSuccess(res, loan, 201);
  } catch (error) {
    next(error);
  }
}

/**
 * Marks a loan as returned and handles fine creation.
 * @param req Express request containing loan id.
 * @param res Express response.
 * @param next Express next handler.
 * @returns Promise resolving when response is sent.
 */
export async function returnController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await returnBook({
      userId: req.user!.id,
      loanId: req.body.loanId,
      isAdmin: req.user!.role === 'Admin'
    });
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}

/**
 * Lists loans for the authenticated member.
 * @param req Express request.
 * @param res Express response.
 * @param next Express next handler.
 * @returns Promise resolving when response is sent.
 */
export async function listMyLoansController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const loans = await listMyLoans(req.user!.id);
    sendSuccess(res, loans);
  } catch (error) {
    next(error);
  }
}
