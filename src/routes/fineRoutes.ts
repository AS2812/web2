import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { validate } from '../middleware/validate';
import { listMyFinesController, payFineController } from '../controllers/fineController';

const router = Router();

const fineParamSchema = z.object({
  params: z.object({
    id: z.string()
  })
});

router.get('/me', authenticate, requireRole('Member'), listMyFinesController);
router.patch(
  '/:id/pay',
  authenticate,
  requireRole('Member', 'Admin'),
  validate(fineParamSchema),
  payFineController
);

export default router;
