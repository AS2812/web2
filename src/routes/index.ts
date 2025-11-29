import { Router } from 'express';
import authRoutes from './authRoutes';
import bookRoutes from './bookRoutes';
import authorRoutes from './authorRoutes';
import publisherRoutes from './publisherRoutes';
import loanRoutes from './loanRoutes';
import reservationRoutes from './reservationRoutes';
import fineRoutes from './fineRoutes';
import adminRoutes from './adminRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/books', bookRoutes);
router.use('/authors', authorRoutes);
router.use('/publishers', publisherRoutes);
router.use('/loans', loanRoutes);
router.use('/reservations', reservationRoutes);
router.use('/fines', fineRoutes);
router.use('/admin', adminRoutes);

export default router;
