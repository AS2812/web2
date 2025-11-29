"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const dayjs_1 = __importDefault(require("dayjs"));
const setup_1 = require("./setup");
const prisma_1 = require("../src/utils/prisma");
describe('Library Management API', () => {
    beforeEach(async () => {
        await (0, setup_1.resetDatabase)();
    });
    test('register and login works', async () => {
        const registerResponse = await (0, supertest_1.default)(setup_1.app).post('/auth/register').send({
            username: 'member1',
            email: 'member1@example.com',
            password: 'Password123!',
            name: 'Member One'
        });
        expect(registerResponse.status).toBe(201);
        expect(registerResponse.body.success).toBe(true);
        expect(registerResponse.body.data.token).toBeDefined();
        const loginResponse = await (0, supertest_1.default)(setup_1.app)
            .post('/auth/login')
            .send({ username: 'member1', password: 'Password123!' });
        expect(loginResponse.status).toBe(200);
        expect(loginResponse.body.success).toBe(true);
        expect(loginResponse.body.data.token).toBeDefined();
    });
    test('member cannot create books (role enforcement)', async () => {
        const member = await (0, setup_1.registerAndLoginMember)('memberRole');
        const response = await (0, supertest_1.default)(setup_1.app)
            .post('/books')
            .set('Authorization', `Bearer ${member.token}`)
            .send({
            isbn: 'ABC123',
            title: 'Restricted Book',
            totalCopies: 1,
            copiesAvailable: 1
        });
        expect(response.status).toBe(403);
        expect(response.body.success).toBe(false);
    });
    test('borrow flow fails when copies_available == 0', async () => {
        const admin = await (0, setup_1.seedAdmin)();
        await (0, supertest_1.default)(setup_1.app)
            .post('/books')
            .set('Authorization', `Bearer ${admin.token}`)
            .send({
            isbn: 'NO-COPIES',
            title: 'Empty Shelf',
            totalCopies: 1,
            copiesAvailable: 0
        });
        const member = await (0, setup_1.registerAndLoginMember)('memberNoCopies');
        const borrowResponse = await (0, supertest_1.default)(setup_1.app)
            .post('/loans/borrow')
            .set('Authorization', `Bearer ${member.token}`)
            .send({ isbn: 'NO-COPIES' });
        expect(borrowResponse.status).toBe(409);
        expect(borrowResponse.body.success).toBe(false);
    });
    test('borrow then return updates inventory', async () => {
        const admin = await (0, setup_1.seedAdmin)();
        await (0, supertest_1.default)(setup_1.app)
            .post('/books')
            .set('Authorization', `Bearer ${admin.token}`)
            .send({
            isbn: 'INV-1',
            title: 'Inventory Book',
            totalCopies: 1,
            copiesAvailable: 1
        });
        const member = await (0, setup_1.registerAndLoginMember)('memberBorrow');
        const borrowResponse = await (0, supertest_1.default)(setup_1.app)
            .post('/loans/borrow')
            .set('Authorization', `Bearer ${member.token}`)
            .send({ isbn: 'INV-1' });
        expect(borrowResponse.status).toBe(201);
        const loanId = borrowResponse.body.data.loanId;
        const afterBorrow = await (0, supertest_1.default)(setup_1.app)
            .get('/books/INV-1')
            .set('Authorization', `Bearer ${member.token}`);
        expect(afterBorrow.body.data.copiesAvailable).toBe(0);
        const returnResponse = await (0, supertest_1.default)(setup_1.app)
            .post('/loans/return')
            .set('Authorization', `Bearer ${member.token}`)
            .send({ loanId });
        expect(returnResponse.status).toBe(200);
        const afterReturn = await (0, supertest_1.default)(setup_1.app)
            .get('/books/INV-1')
            .set('Authorization', `Bearer ${member.token}`);
        expect(afterReturn.body.data.copiesAvailable).toBe(1);
    });
    test('overdue return creates a fine', async () => {
        const admin = await (0, setup_1.seedAdmin)();
        await (0, supertest_1.default)(setup_1.app)
            .post('/books')
            .set('Authorization', `Bearer ${admin.token}`)
            .send({
            isbn: 'FINE-1',
            title: 'Fine Book',
            totalCopies: 1,
            copiesAvailable: 1
        });
        const member = await (0, setup_1.registerAndLoginMember)('memberFine');
        const borrowResponse = await (0, supertest_1.default)(setup_1.app)
            .post('/loans/borrow')
            .set('Authorization', `Bearer ${member.token}`)
            .send({ isbn: 'FINE-1' });
        const loanId = borrowResponse.body.data.loanId;
        await prisma_1.prisma.loan.update({
            where: { loanId },
            data: { dueDate: (0, dayjs_1.default)().subtract(5, 'day').toDate() }
        });
        const returnResponse = await (0, supertest_1.default)(setup_1.app)
            .post('/loans/return')
            .set('Authorization', `Bearer ${member.token}`)
            .send({ loanId });
        expect(returnResponse.status).toBe(200);
        expect(returnResponse.body.data.fine).toBeDefined();
        expect(returnResponse.body.data.fine.fineAmount).toBeGreaterThanOrEqual(5);
    });
    test('reservation uniqueness behavior', async () => {
        const admin = await (0, setup_1.seedAdmin)();
        await (0, supertest_1.default)(setup_1.app)
            .post('/books')
            .set('Authorization', `Bearer ${admin.token}`)
            .send({
            isbn: 'RSV-1',
            title: 'Reserved Book',
            totalCopies: 1,
            copiesAvailable: 1
        });
        const member = await (0, setup_1.registerAndLoginMember)('memberReserve');
        const first = await (0, supertest_1.default)(setup_1.app)
            .post('/reservations')
            .set('Authorization', `Bearer ${member.token}`)
            .send({ isbn: 'RSV-1' });
        expect(first.status).toBe(201);
        const second = await (0, supertest_1.default)(setup_1.app)
            .post('/reservations')
            .set('Authorization', `Bearer ${member.token}`)
            .send({ isbn: 'RSV-1' });
        expect(second.status).toBe(409);
    });
    test('me endpoints return only the user’s records', async () => {
        const admin = await (0, setup_1.seedAdmin)();
        await (0, supertest_1.default)(setup_1.app)
            .post('/books')
            .set('Authorization', `Bearer ${admin.token}`)
            .send({
            isbn: 'ME-1',
            title: 'Scoped Book',
            totalCopies: 1,
            copiesAvailable: 1
        });
        const memberA = await (0, setup_1.registerAndLoginMember)('memberA');
        const memberB = await (0, setup_1.registerAndLoginMember)('memberB');
        await (0, supertest_1.default)(setup_1.app)
            .post('/loans/borrow')
            .set('Authorization', `Bearer ${memberA.token}`)
            .send({ isbn: 'ME-1' });
        const loansB = await (0, supertest_1.default)(setup_1.app)
            .get('/loans/me')
            .set('Authorization', `Bearer ${memberB.token}`);
        expect(loansB.status).toBe(200);
        expect(loansB.body.data).toHaveLength(0);
    });
    test('fine payment works for owner', async () => {
        const admin = await (0, setup_1.seedAdmin)();
        await (0, supertest_1.default)(setup_1.app)
            .post('/books')
            .set('Authorization', `Bearer ${admin.token}`)
            .send({
            isbn: 'PAY-1',
            title: 'Payable Book',
            totalCopies: 1,
            copiesAvailable: 1
        });
        const member = await (0, setup_1.registerAndLoginMember)('memberPay');
        const borrowResponse = await (0, supertest_1.default)(setup_1.app)
            .post('/loans/borrow')
            .set('Authorization', `Bearer ${member.token}`)
            .send({ isbn: 'PAY-1' });
        const loanId = borrowResponse.body.data.loanId;
        await prisma_1.prisma.loan.update({
            where: { loanId },
            data: { dueDate: (0, dayjs_1.default)().subtract(2, 'day').toDate() }
        });
        const returnResponse = await (0, supertest_1.default)(setup_1.app)
            .post('/loans/return')
            .set('Authorization', `Bearer ${member.token}`)
            .send({ loanId });
        const fineId = returnResponse.body.data.fine.fineId;
        const payResponse = await (0, supertest_1.default)(setup_1.app)
            .patch(`/fines/${fineId}/pay`)
            .set('Authorization', `Bearer ${member.token}`);
        expect(payResponse.status).toBe(200);
        expect(payResponse.body.data.paymentStatus).toBe('Paid');
    });
});
