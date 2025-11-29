import { Author } from '@prisma/client';
import {
  createAuthor,
  deleteAuthor,
  getAuthor,
  listAuthors,
  updateAuthor
} from '../repositories/authorRepository';
import { NotFoundError } from '../utils/errors';

/**
 * Retrieves all authors.
 * @returns Promise resolving to authors list.
 */
export async function getAuthors(): Promise<Author[]> {
  return listAuthors();
}

/**
 * Creates a new author.
 * @param name Author name.
 * @returns Promise resolving to created author.
 */
export async function createNewAuthor(name: string): Promise<Author> {
  return createAuthor({ name });
}

/**
 * Updates an existing author.
 * @param authorId Identifier for the author.
 * @param name New name to apply.
 * @returns Promise resolving to updated author.
 * @throws {NotFoundError} When the author does not exist.
 */
export async function updateExistingAuthor(authorId: number, name: string): Promise<Author> {
  const author = await getAuthor(authorId);
  if (!author) {
    throw new NotFoundError('Author not found');
  }
  return updateAuthor(authorId, { name });
}

/**
 * Deletes an author by id.
 * @param authorId Identifier to delete.
 * @returns Promise resolving to removed author.
 * @throws {NotFoundError} When not found.
 */
export async function removeAuthor(authorId: number): Promise<Author> {
  const author = await getAuthor(authorId);
  if (!author) {
    throw new NotFoundError('Author not found');
  }
  return deleteAuthor(authorId);
}
