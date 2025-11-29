import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { validate } from '../middleware/validate';
import {
  createBookEntry,
  deleteBookEntry,
  getBookByIsbn,
  listAllBooks,
  updateBookEntry
} from '../controllers/bookController';

const router = Router();

const bookBaseSchema = {
  isbn: z.string().min(3),
  title: z.string().min(1),
  edition: z.string().optional(),
  category: z.string().optional(),
  publicationDate: z.string().optional(),
  publisherId: z.number().int().optional(),
  copiesAvailable: z.number().int().nonnegative().optional(),
  totalCopies: z.number().int().positive().optional(),
  authorIds: z.array(z.number().int()).optional()
};

const createSchema = z.object({
  body: z.object(bookBaseSchema)
});

const updateSchema = z.object({
  body: z.object({
    title: z.string().optional(),
    edition: z.string().optional(),
    category: z.string().optional(),
    publicationDate: z.string().optional(),
    publisherId: z.number().int().optional(),
    copiesAvailable: z.number().int().nonnegative().optional(),
    totalCopies: z.number().int().positive().optional(),
    authorIds: z.array(z.number().int()).optional()
  }),
  params: z.object({ isbn: z.string() })
});

const isbnParamSchema = z.object({ params: z.object({ isbn: z.string() }) });

router.get('/', authenticate, listAllBooks);
router.get('/:isbn', authenticate, validate(isbnParamSchema), getBookByIsbn);
router.post('/', authenticate, requireRole('Admin'), validate(createSchema), createBookEntry);
router.patch('/:isbn', authenticate, requireRole('Admin'), validate(updateSchema), updateBookEntry);
router.delete('/:isbn', authenticate, requireRole('Admin'), validate(isbnParamSchema), deleteBookEntry);

export default router;
