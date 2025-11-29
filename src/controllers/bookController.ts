import { Request, Response, NextFunction } from 'express';
import {
  createBookWithAuthors,
  getBook,
  getBooks,
  removeBook,
  updateBookWithAuthors
} from '../services/bookService';
import { sendSuccess } from '../utils/response';

/**
 * Lists all books.
 * @param _req Express request.
 * @param res Express response.
 * @param next Express next handler.
 * @returns Promise resolving when response is sent.
 */
export async function listAllBooks(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const books = await getBooks();
    sendSuccess(res, books);
  } catch (error) {
    next(error);
  }
}

/**
 * Retrieves a single book by ISBN.
 * @param req Express request containing ISBN path param.
 * @param res Express response.
 * @param next Express next handler.
 * @returns Promise resolving when response is sent.
 */
export async function getBookByIsbn(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const book = await getBook(req.params.isbn);
    sendSuccess(res, book);
  } catch (error) {
    next(error);
  }
}

/**
 * Creates a new book entry.
 * @param req Express request containing book payload.
 * @param res Express response.
 * @param next Express next handler.
 * @returns Promise resolving when response is sent.
 */
export async function createBookEntry(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const book = await createBookWithAuthors({
      isbn: req.body.isbn,
      title: req.body.title,
      edition: req.body.edition,
      category: req.body.category,
      publicationDate: req.body.publicationDate ? new Date(req.body.publicationDate) : undefined,
      publisherId: req.body.publisherId,
      copiesAvailable: req.body.copiesAvailable,
      totalCopies: req.body.totalCopies,
      authorIds: req.body.authorIds
    });
    sendSuccess(res, book, 201);
  } catch (error) {
    next(error);
  }
}

/**
 * Updates an existing book entry.
 * @param req Express request containing ISBN and update payload.
 * @param res Express response.
 * @param next Express next handler.
 * @returns Promise resolving when response is sent.
 */
export async function updateBookEntry(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const book = await updateBookWithAuthors(req.params.isbn, {
      title: req.body.title,
      edition: req.body.edition,
      category: req.body.category,
      publicationDate: req.body.publicationDate ? new Date(req.body.publicationDate) : undefined,
      publisherId: req.body.publisherId,
      copiesAvailable: req.body.copiesAvailable,
      totalCopies: req.body.totalCopies,
      authorIds: req.body.authorIds
    });
    sendSuccess(res, book);
  } catch (error) {
    next(error);
  }
}

/**
 * Deletes a book.
 * @param req Express request containing ISBN path param.
 * @param res Express response.
 * @param next Express next handler.
 * @returns Promise resolving when response is sent.
 */
export async function deleteBookEntry(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const book = await removeBook(req.params.isbn);
    sendSuccess(res, book);
  } catch (error) {
    next(error);
  }
}
