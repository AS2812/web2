import { Author, Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';

/**
 * Lists authors.
 * @returns Promise resolving to author array.
 */
export async function listAuthors(): Promise<Author[]> {
  return prisma.author.findMany();
}

/**
 * Retrieves author by id.
 * @param authorId Identifier for the author.
 * @returns Promise resolving to author or null.
 */
export async function getAuthor(authorId: number): Promise<Author | null> {
  return prisma.author.findUnique({ where: { authorId } });
}

/**
 * Creates a new author.
 * @param data Author creation payload.
 * @returns Promise resolving to created author.
 */
export async function createAuthor(data: Prisma.AuthorCreateInput): Promise<Author> {
  return prisma.author.create({ data });
}

/**
 * Updates an author.
 * @param authorId Identifier of the author to update.
 * @param data Payload to update.
 * @returns Promise resolving to updated author.
 */
export async function updateAuthor(
  authorId: number,
  data: Prisma.AuthorUpdateInput
): Promise<Author> {
  return prisma.author.update({ where: { authorId }, data });
}

/**
 * Deletes an author.
 * @param authorId Identifier to delete.
 * @returns Promise resolving to removed author.
 */
export async function deleteAuthor(authorId: number): Promise<Author> {
  return prisma.author.delete({ where: { authorId } });
}
