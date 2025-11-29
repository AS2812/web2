import { Router } from 'express';
import { z } from 'zod';
import { authRateLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import { loginUser, me, register } from '../controllers/authController';

const router = Router();

const registerSchema = z.object({
  body: z.object({
    username: z.string().min(3),
    email: z.string().email(),
    password: z.string().min(6),
    name: z.string().min(1),
    address: z.string().optional()
  })
});

const loginSchema = z.object({
  body: z.object({
    username: z.string().min(3),
    password: z.string().min(6)
  })
});

router.post('/register', authRateLimiter(), validate(registerSchema), register);
router.post('/login', authRateLimiter(), validate(loginSchema), loginUser);
router.get('/me', authenticate, me);

export default router;
