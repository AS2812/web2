import { Book, Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';

/**
 * Retrieves all books.
 * @returns Promise resolving to book list.
 */
export async function listBooks(): Promise<Book[]> {
  return prisma.book.findMany({
    include: { publisher: true }
  });
}

/**
 * Retrieves a book by ISBN.
 * @param isbn Book ISBN.
 * @returns Promise resolving to book or null.
 */
export async function getBookByIsbn(isbn: string): Promise<Book | null> {
  return prisma.book.findUnique({ where: { isbn } });
}

/**
 * Creates a new book record.
 * @param data Book creation payload.
 * @returns Promise resolving to created book.
 */
export async function createBook(data: Prisma.BookCreateInput): Promise<Book> {
  return prisma.book.create({ data });
}

/**
 * Updates an existing book.
 * @param isbn Identifier for the book to update.
 * @param data Partial update payload.
 * @returns Promise resolving to updated book.
 */
export async function updateBook(isbn: string, data: Prisma.BookUpdateInput): Promise<Book> {
  return prisma.book.update({ where: { isbn }, data });
}

/**
 * Deletes a book by ISBN.
 * @param isbn Identifier for the book.
 * @returns Promise resolving to removed book.
 */
export async function deleteBook(isbn: string): Promise<Book> {
  return prisma.book.delete({ where: { isbn } });
}

/**
 * Decrements available copies by one.
 * @param isbn Identifier for the book.
 * @returns Promise resolving when update completes.
 */
export async function decrementAvailableCopies(isbn: string): Promise<void> {
  await prisma.book.update({
    where: { isbn },
    data: { copiesAvailable: { decrement: 1 } }
  });
}

/**
 * Increments available copies by one.
 * @param isbn Identifier for the book.
 * @returns Promise resolving when update completes.
 */
export async function incrementAvailableCopies(isbn: string): Promise<void> {
  await prisma.book.update({
    where: { isbn },
    data: { copiesAvailable: { increment: 1 } }
  });
}
