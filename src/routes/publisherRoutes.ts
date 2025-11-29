import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { validate } from '../middleware/validate';
import {
  createPublisherController,
  deletePublisherController,
  listPublishersController,
  updatePublisherController
} from '../controllers/publisherController';

const router = Router();

const publisherBodySchema = z.object({
  body: z.object({
    name: z.string().min(1),
    address: z.string().optional()
  })
});

const publisherParamSchema = z.object({
  params: z.object({
    id: z.string()
  })
});

router.get('/', authenticate, listPublishersController);
router.post(
  '/',
  authenticate,
  requireRole('Admin'),
  validate(publisherBodySchema),
  createPublisherController
);
router.patch(
  '/:id',
  authenticate,
  requireRole('Admin'),
  validate(publisherBodySchema.merge(publisherParamSchema)),
  updatePublisherController
);
router.delete(
  '/:id',
  authenticate,
  requireRole('Admin'),
  validate(publisherParamSchema),
  deletePublisherController
);

export default router;
