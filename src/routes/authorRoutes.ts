import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { validate } from '../middleware/validate';
import {
  createAuthorController,
  deleteAuthorController,
  listAuthorsController,
  updateAuthorController
} from '../controllers/authorController';

const router = Router();

const authorBodySchema = z.object({
  body: z.object({
    name: z.string().min(1)
  })
});

const authorParamSchema = z.object({
  params: z.object({
    id: z.string()
  })
});

router.get('/', authenticate, listAuthorsController);
router.post('/', authenticate, requireRole('Admin'), validate(authorBodySchema), createAuthorController);
router.patch(
  '/:id',
  authenticate,
  requireRole('Admin'),
  validate(authorBodySchema.merge(authorParamSchema)),
  updateAuthorController
);
router.delete(
  '/:id',
  authenticate,
  requireRole('Admin'),
  validate(authorParamSchema),
  deleteAuthorController
);

export default router;
