import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { validate } from '../middleware/validate';
import {
  borrowController,
  listMyLoansController,
  returnController
} from '../controllers/loanController';

const router = Router();

const borrowSchema = z.object({
  body: z.object({
    isbn: z.string().min(1)
  })
});

const returnSchema = z.object({
  body: z.object({
    loanId: z.number().int()
  })
});

router.post('/borrow', authenticate, requireRole('Member'), validate(borrowSchema), borrowController);
router.post(
  '/return',
  authenticate,
  requireRole('Member', 'Admin'),
  validate(returnSchema),
  returnController
);
router.get('/me', authenticate, requireRole('Member'), listMyLoansController);

export default router;
