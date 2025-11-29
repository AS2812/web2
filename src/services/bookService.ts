import { Book, Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '../utils/errors';
import {
  createBook,
  deleteBook,
  getBookByIsbn,
  listBooks,
  updateBook
} from '../repositories/bookRepository';
import { getAuthor } from '../repositories/authorRepository';
import { getPublisher } from '../repositories/publisherRepository';

/**
 * Lists all books with publisher information.
 * @returns Promise resolving to array of books.
 */
export async function getBooks(): Promise<Book[]> {
  return listBooks();
}

/**
 * Retrieves a single book by ISBN.
 * @param isbn Identifier of the book.
 * @returns Promise resolving to found book.
 * @throws {NotFoundError} When the book does not exist.
 */
export async function getBook(isbn: string): Promise<Book> {
  const book = await getBookByIsbn(isbn);
  if (!book) {
    throw new NotFoundError('Book not found');
  }
  return book;
}

/**
 * Creates a book and links authors when provided.
 * @param payload Book creation payload including optional authorIds.
 * @returns Promise resolving to created book.
 * @throws {ConflictError} When copies configuration is invalid.
 * @throws {NotFoundError} When referenced publisher or author does not exist.
 */
export async function createBookWithAuthors(payload: {
  isbn: string;
  title: string;
  edition?: string;
  category?: string;
  publicationDate?: Date;
  publisherId?: number;
  copiesAvailable?: number;
  totalCopies?: number;
  authorIds?: number[];
}): Promise<Book> {
  if (
    payload.totalCopies !== undefined &&
    payload.copiesAvailable !== undefined &&
    payload.copiesAvailable > payload.totalCopies
  ) {
    throw new ConflictError('Copies available cannot exceed total copies');
  }

  if (payload.publisherId) {
    const publisher = await getPublisher(payload.publisherId);
    if (!publisher) {
      throw new NotFoundError('Publisher not found');
    }
  }

  const authorIds = payload.authorIds ?? [];
  // Validate authors before creating to fail fast.
  for (const authorId of authorIds) {
    const author = await getAuthor(authorId);
    if (!author) {
      throw new NotFoundError(`Author ${authorId} not found`);
    }
  }

  const data: Prisma.BookCreateInput = {
    isbn: payload.isbn,
    title: payload.title,
    edition: payload.edition ?? null,
    category: payload.category ?? null,
    publicationDate: payload.publicationDate ?? null,
    copiesAvailable: payload.copiesAvailable ?? payload.totalCopies ?? 1,
    totalCopies: payload.totalCopies ?? payload.copiesAvailable ?? 1,
    publisher: payload.publisherId ? { connect: { publisherId: payload.publisherId } } : undefined,
    authors:
      authorIds.length > 0
        ? {
            create: authorIds.map((authorId) => ({
              author: { connect: { authorId } }
            }))
          }
        : undefined
  };

  return createBook(data);
}

/**
 * Updates an existing book and optionally replaces author links.
 * @param isbn Identifier of the book to update.
 * @param payload Partial update payload.
 * @returns Promise resolving to updated book.
 * @throws {NotFoundError} When the book is missing.
 * @throws {ConflictError} When copy counts are invalid.
 */
export async function updateBookWithAuthors(
  isbn: string,
  payload: Partial<{
    title: string;
    edition: string;
    category: string;
    publicationDate: Date;
    publisherId: number;
    copiesAvailable: number;
    totalCopies: number;
    authorIds: number[];
  }>
): Promise<Book> {
  const book = await getBookByIsbn(isbn);
  if (!book) {
    throw new NotFoundError('Book not found');
  }

  const copiesAvailable = payload.copiesAvailable ?? book.copiesAvailable;
  const totalCopies = payload.totalCopies ?? book.totalCopies;

  // Prevent invalid inventory states.
  if (copiesAvailable > totalCopies) {
    throw new ConflictError('Copies available cannot exceed total copies');
  }

  if (payload.publisherId) {
    const publisher = await getPublisher(payload.publisherId);
    if (!publisher) {
      throw new NotFoundError('Publisher not found');
    }
  }

  const authorIds = payload.authorIds;
  if (authorIds) {
    for (const authorId of authorIds) {
      const author = await getAuthor(authorId);
      if (!author) {
        throw new NotFoundError(`Author ${authorId} not found`);
      }
    }
  }

  const data: Prisma.BookUpdateInput = {
    title: payload.title ?? undefined,
    edition: payload.edition ?? undefined,
    category: payload.category ?? undefined,
    publicationDate: payload.publicationDate ?? undefined,
    copiesAvailable,
    totalCopies,
    publisher: payload.publisherId
      ? { connect: { publisherId: payload.publisherId } }
      : payload.publisherId === null
      ? { disconnect: true }
      : undefined,
    // Replace author relations when array provided.
    authors: authorIds
      ? {
          deleteMany: {},
          create: authorIds.map((authorId) => ({
            author: { connect: { authorId } }
          }))
        }
      : undefined
  };

  return updateBook(isbn, data);
}

/**
 * Deletes a book by ISBN.
 * @param isbn Identifier to remove.
 * @returns Promise resolving to removed book.
 * @throws {NotFoundError} When the book is missing.
 */
export async function removeBook(isbn: string): Promise<Book> {
  const book = await getBookByIsbn(isbn);
  if (!book) {
    throw new NotFoundError('Book not found');
  }
  return deleteBook(isbn);
}
