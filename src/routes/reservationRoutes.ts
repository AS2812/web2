import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { validate } from '../middleware/validate';
import {
  cancelReservationController,
  createReservationController,
  listMyReservationsController
} from '../controllers/reservationController';

const router = Router();

const createSchema = z.object({
  body: z.object({
    isbn: z.string().min(1)
  })
});

const cancelSchema = z.object({
  params: z.object({
    id: z.string()
  })
});

router.post(
  '/',
  authenticate,
  requireRole('Member'),
  validate(createSchema),
  createReservationController
);
router.patch(
  '/:id/cancel',
  authenticate,
  requireRole('Member'),
  validate(cancelSchema),
  cancelReservationController
);
router.get('/me', authenticate, requireRole('Member'), listMyReservationsController);

export default router;
