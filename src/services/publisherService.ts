import { Publisher } from '@prisma/client';
import {
  createPublisher,
  deletePublisher,
  getPublisher,
  listPublishers,
  updatePublisher
} from '../repositories/publisherRepository';
import { NotFoundError } from '../utils/errors';

/**
 * Retrieves all publishers.
 * @returns Promise resolving to publisher list.
 */
export async function getPublishers(): Promise<Publisher[]> {
  return listPublishers();
}

/**
 * Creates a new publisher.
 * @param payload Publisher creation payload.
 * @returns Promise resolving to created publisher.
 */
export async function createNewPublisher(payload: {
  name: string;
  address?: string;
}): Promise<Publisher> {
  return createPublisher({ name: payload.name, address: payload.address ?? null });
}

/**
 * Updates a publisher by id.
 * @param publisherId Identifier for the publisher.
 * @param payload Update payload.
 * @returns Promise resolving to updated publisher.
 * @throws {NotFoundError} When the publisher is missing.
 */
export async function updateExistingPublisher(
  publisherId: number,
  payload: { name?: string; address?: string }
): Promise<Publisher> {
  const publisher = await getPublisher(publisherId);
  if (!publisher) {
    throw new NotFoundError('Publisher not found');
  }
  return updatePublisher(publisherId, {
    name: payload.name ?? undefined,
    address: payload.address ?? undefined
  });
}

/**
 * Deletes a publisher.
 * @param publisherId Identifier to delete.
 * @returns Promise resolving to removed publisher.
 * @throws {NotFoundError} When not found.
 */
export async function removePublisher(publisherId: number): Promise<Publisher> {
  const publisher = await getPublisher(publisherId);
  if (!publisher) {
    throw new NotFoundError('Publisher not found');
  }
  return deletePublisher(publisherId);
}
