import { Request, Response, NextFunction } from 'express';
import {
  createNewAuthor,
  getAuthors,
  removeAuthor,
  updateExistingAuthor
} from '../services/authorService';
import { sendSuccess } from '../utils/response';

/**
 * Lists all authors.
 * @param _req Express request.
 * @param res Express response.
 * @param next Express next handler.
 * @returns Promise resolving when response is sent.
 */
export async function listAuthorsController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authors = await getAuthors();
    sendSuccess(res, authors);
  } catch (error) {
    next(error);
  }
}

/**
 * Creates an author record.
 * @param req Express request containing author payload.
 * @param res Express response.
 * @param next Express next handler.
 * @returns Promise resolving when response is sent.
 */
export async function createAuthorController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const author = await createNewAuthor(req.body.name);
    sendSuccess(res, author, 201);
  } catch (error) {
    next(error);
  }
}

/**
 * Updates an author.
 * @param req Express request containing id and payload.
 * @param res Express response.
 * @param next Express next handler.
 * @returns Promise resolving when response is sent.
 */
export async function updateAuthorController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const author = await updateExistingAuthor(Number(req.params.id), req.body.name);
    sendSuccess(res, author);
  } catch (error) {
    next(error);
  }
}

/**
 * Deletes an author.
 * @param req Express request containing id path param.
 * @param res Express response.
 * @param next Express next handler.
 * @returns Promise resolving when response is sent.
 */
export async function deleteAuthorController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const author = await removeAuthor(Number(req.params.id));
    sendSuccess(res, author);
  } catch (error) {
    next(error);
  }
}
