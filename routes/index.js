const express = require('express');
const authRoutes = require('./auth');
const authorRoutes = require('./authors');
const publisherRoutes = require('./publishers');
const bookRoutes = require('./books');
const loanRoutes = require('./loans');
const reservationRoutes = require('./reservations');
const fineRoutes = require('./fines');
const memberRoutes = require('./members');
const statsRoutes = require('./stats');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/authors', authorRoutes);
router.use('/publishers', publisherRoutes);
router.use('/books', bookRoutes);
router.use('/loans', loanRoutes);
router.use('/reservations', reservationRoutes);
router.use('/fines', fineRoutes);
router.use('/members', memberRoutes);
router.use('/stats', statsRoutes);

module.exports = router;
