import { Request, Response, NextFunction } from 'express';
import {
  cancelMemberReservation,
  createMemberReservation,
  listMyReservations
} from '../services/reservationService';
import { sendSuccess } from '../utils/response';

/**
 * Creates a reservation for the authenticated member.
 * @param req Express request containing ISBN.
 * @param res Express response.
 * @param next Express next handler.
 * @returns Promise resolving when response is sent.
 */
export async function createReservationController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const reservation = await createMemberReservation(req.user!.id, req.body.isbn);
    sendSuccess(res, reservation, 201);
  } catch (error) {
    next(error);
  }
}

/**
 * Cancels a reservation belonging to the member.
 * @param req Express request containing reservation id.
 * @param res Express response.
 * @param next Express next handler.
 * @returns Promise resolving when response is sent.
 */
export async function cancelReservationController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const reservation = await cancelMemberReservation(req.user!.id, Number(req.params.id));
    sendSuccess(res, reservation);
  } catch (error) {
    next(error);
  }
}

/**
 * Lists reservations for the authenticated member.
 * @param req Express request.
 * @param res Express response.
 * @param next Express next handler.
 * @returns Promise resolving when response is sent.
 */
export async function listMyReservationsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const reservations = await listMyReservations(req.user!.id);
    sendSuccess(res, reservations);
  } catch (error) {
    next(error);
  }
}
