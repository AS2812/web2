import { Request, Response, NextFunction } from 'express';
import {
  createNewPublisher,
  getPublishers,
  removePublisher,
  updateExistingPublisher
} from '../services/publisherService';
import { sendSuccess } from '../utils/response';

/**
 * Lists publishers.
 * @param _req Express request.
 * @param res Express response.
 * @param next Express next handler.
 * @returns Promise resolving when response is sent.
 */
export async function listPublishersController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const publishers = await getPublishers();
    sendSuccess(res, publishers);
  } catch (error) {
    next(error);
  }
}

/**
 * Creates a publisher record.
 * @param req Express request containing payload.
 * @param res Express response.
 * @param next Express next handler.
 * @returns Promise resolving when response is sent.
 */
export async function createPublisherController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const publisher = await createNewPublisher({ name: req.body.name, address: req.body.address });
    sendSuccess(res, publisher, 201);
  } catch (error) {
    next(error);
  }
}

/**
 * Updates a publisher record.
 * @param req Express request containing id and payload.
 * @param res Express response.
 * @param next Express next handler.
 * @returns Promise resolving when response is sent.
 */
export async function updatePublisherController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const publisher = await updateExistingPublisher(Number(req.params.id), {
      name: req.body.name,
      address: req.body.address
    });
    sendSuccess(res, publisher);
  } catch (error) {
    next(error);
  }
}

/**
 * Deletes a publisher.
 * @param req Express request containing id param.
 * @param res Express response.
 * @param next Express next handler.
 * @returns Promise resolving when response is sent.
 */
export async function deletePublisherController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const publisher = await removePublisher(Number(req.params.id));
    sendSuccess(res, publisher);
  } catch (error) {
    next(error);
  }
}
