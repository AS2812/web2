import request from 'supertest';
import dayjs from 'dayjs';
import { app, registerAndLoginMember, resetDatabase, seedAdmin } from './setup';
import { prisma } from '../src/utils/prisma';

describe('Library Management API', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  test('register and login works', async () => {
    const registerResponse = await request(app).post('/auth/register').send({
      username: 'member1',
      email: 'member1@example.com',
      password: 'Password123!',
      name: 'Member One'
    });

    expect(registerResponse.status).toBe(201);
    expect(registerResponse.body.success).toBe(true);
    expect(registerResponse.body.data.token).toBeDefined();

    const loginResponse = await request(app)
      .post('/auth/login')
      .send({ username: 'member1', password: 'Password123!' });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.success).toBe(true);
    expect(loginResponse.body.data.token).toBeDefined();
  });

  test('member cannot create books (role enforcement)', async () => {
    const member = await registerAndLoginMember('memberRole');

    const response = await request(app)
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
    const admin = await seedAdmin();

    await request(app)
      .post('/books')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        isbn: 'NO-COPIES',
        title: 'Empty Shelf',
        totalCopies: 1,
        copiesAvailable: 0
      });

    const member = await registerAndLoginMember('memberNoCopies');

    const borrowResponse = await request(app)
      .post('/loans/borrow')
      .set('Authorization', `Bearer ${member.token}`)
      .send({ isbn: 'NO-COPIES' });

    expect(borrowResponse.status).toBe(409);
    expect(borrowResponse.body.success).toBe(false);
  });

  test('borrow then return updates inventory', async () => {
    const admin = await seedAdmin();

    await request(app)
      .post('/books')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        isbn: 'INV-1',
        title: 'Inventory Book',
        totalCopies: 1,
        copiesAvailable: 1
      });

    const member = await registerAndLoginMember('memberBorrow');

    const borrowResponse = await request(app)
      .post('/loans/borrow')
      .set('Authorization', `Bearer ${member.token}`)
      .send({ isbn: 'INV-1' });

    expect(borrowResponse.status).toBe(201);
    const loanId = borrowResponse.body.data.loanId;

    const afterBorrow = await request(app)
      .get('/books/INV-1')
      .set('Authorization', `Bearer ${member.token}`);

    expect(afterBorrow.body.data.copiesAvailable).toBe(0);

    const returnResponse = await request(app)
      .post('/loans/return')
      .set('Authorization', `Bearer ${member.token}`)
      .send({ loanId });

    expect(returnResponse.status).toBe(200);

    const afterReturn = await request(app)
      .get('/books/INV-1')
      .set('Authorization', `Bearer ${member.token}`);

    expect(afterReturn.body.data.copiesAvailable).toBe(1);
  });

  test('overdue return creates a fine', async () => {
    const admin = await seedAdmin();

    await request(app)
      .post('/books')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        isbn: 'FINE-1',
        title: 'Fine Book',
        totalCopies: 1,
        copiesAvailable: 1
      });

    const member = await registerAndLoginMember('memberFine');

    const borrowResponse = await request(app)
      .post('/loans/borrow')
      .set('Authorization', `Bearer ${member.token}`)
      .send({ isbn: 'FINE-1' });

    expect(borrowResponse.status).toBe(201);

    const loanId = borrowResponse.body.data.loanId;

    // Force overdue by editing dueDate in DB
    await prisma.loan.update({
      where: { loanId },
      data: { dueDate: dayjs().subtract(5, 'day').toDate() }
    });

    const returnResponse = await request(app)
      .post('/loans/return')
      .set('Authorization', `Bearer ${member.token}`)
      .send({ loanId });

    expect(returnResponse.status).toBe(200);
    expect(returnResponse.body.data.fine).toBeDefined();

    // SQL Server Decimal often comes back as string -> convert before comparing
    const fineAmount = Number(returnResponse.body.data.fine.fineAmount);
    expect(Number.isFinite(fineAmount)).toBe(true);
    expect(fineAmount).toBeGreaterThanOrEqual(5);
  });

  test('reservation uniqueness behavior', async () => {
    const admin = await seedAdmin();

    await request(app)
      .post('/books')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        isbn: 'RSV-1',
        title: 'Reserved Book',
        totalCopies: 1,
        copiesAvailable: 1
      });

    const member = await registerAndLoginMember('memberReserve');

    const first = await request(app)
      .post('/reservations')
      .set('Authorization', `Bearer ${member.token}`)
      .send({ isbn: 'RSV-1' });

    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/reservations')
      .set('Authorization', `Bearer ${member.token}`)
      .send({ isbn: 'RSV-1' });

    expect(second.status).toBe(409);
  });

  test("me endpoints return only the user’s records", async () => {
    const admin = await seedAdmin();

    await request(app)
      .post('/books')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        isbn: 'ME-1',
        title: 'Scoped Book',
        totalCopies: 1,
        copiesAvailable: 1
      });

    const memberA = await registerAndLoginMember('memberA');
    const memberB = await registerAndLoginMember('memberB');

    await request(app)
      .post('/loans/borrow')
      .set('Authorization', `Bearer ${memberA.token}`)
      .send({ isbn: 'ME-1' });

    const loansB = await request(app)
      .get('/loans/me')
      .set('Authorization', `Bearer ${memberB.token}`);

    expect(loansB.status).toBe(200);
    expect(loansB.body.data).toHaveLength(0);
  });

  test('fine payment works for owner', async () => {
    const admin = await seedAdmin();

    await request(app)
      .post('/books')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        isbn: 'PAY-1',
        title: 'Payable Book',
        totalCopies: 1,
        copiesAvailable: 1
      });

    const member = await registerAndLoginMember('memberPay');

    const borrowResponse = await request(app)
      .post('/loans/borrow')
      .set('Authorization', `Bearer ${member.token}`)
      .send({ isbn: 'PAY-1' });

    expect(borrowResponse.status).toBe(201);

    const loanId = borrowResponse.body.data.loanId;

    await prisma.loan.update({
      where: { loanId },
      data: { dueDate: dayjs().subtract(2, 'day').toDate() }
    });

    const returnResponse = await request(app)
      .post('/loans/return')
      .set('Authorization', `Bearer ${member.token}`)
      .send({ loanId });

    expect(returnResponse.status).toBe(200);

    const fineId = returnResponse.body.data.fine.fineId;

    const payResponse = await request(app)
      .patch(`/fines/${fineId}/pay`)
      .set('Authorization', `Bearer ${member.token}`);

    expect(payResponse.status).toBe(200);
    expect(payResponse.body.data.paymentStatus).toBe('Paid');
  });
});
