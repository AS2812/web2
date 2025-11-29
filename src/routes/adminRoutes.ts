import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { adminDashboard } from '../controllers/adminController';

const router = Router();

router.get('/dashboard', authenticate, requireRole('Admin'), adminDashboard);

export default router;
