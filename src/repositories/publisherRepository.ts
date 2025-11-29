import { Publisher, Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';

/**
 * Lists publishers.
 * @returns Promise resolving to publisher list.
 */
export async function listPublishers(): Promise<Publisher[]> {
  return prisma.publisher.findMany();
}

/**
 * Retrieves publisher by id.
 * @param publisherId Identifier for the publisher.
 * @returns Promise resolving to publisher or null.
 */
export async function getPublisher(publisherId: number): Promise<Publisher | null> {
  return prisma.publisher.findUnique({ where: { publisherId } });
}

/**
 * Creates a new publisher.
 * @param data Payload for creation.
 * @returns Promise resolving to created publisher.
 */
export async function createPublisher(data: Prisma.PublisherCreateInput): Promise<Publisher> {
  return prisma.publisher.create({ data });
}

/**
 * Updates an existing publisher.
 * @param publisherId Identifier to update.
 * @param data Payload for update.
 * @returns Promise resolving to updated publisher.
 */
export async function updatePublisher(
  publisherId: number,
  data: Prisma.PublisherUpdateInput
): Promise<Publisher> {
  return prisma.publisher.update({ where: { publisherId }, data });
}

/**
 * Deletes a publisher.
 * @param publisherId Identifier to delete.
 * @returns Promise resolving to removed publisher.
 */
export async function deletePublisher(publisherId: number): Promise<Publisher> {
  return prisma.publisher.delete({ where: { publisherId } });
}
