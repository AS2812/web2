const path = require('path');
process.env.NODE_ENV = 'test';
process.env.DB_PATH = process.env.DB_PATH || path.join(__dirname, 'test.db');
const request = require('supertest');
const { expect } = require('chai');
const { app } = require('../server');
const { init, seed, run, get } = require('../db');

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

async function adminToken() {
  const res = await request(app)
    .post('/auth/login')
    .send({ username: 'admin', password: process.env.ADMIN_PASSWORD || 'admin123' });
  expect(res.status).to.equal(200);
  expect(res.body?.data?.token).to.be.a('string');
  const token = res.body.data.token;
  const session = await get('SELECT * FROM sessions WHERE userId = ?', [1]);
  expect(session).to.exist;
  // sanity check token works
  const me = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);
  if (me.status !== 200) {
    console.error('Auth/me failed', me.body);
  }
  expect(me.status).to.equal(200);
  return token;
}

async function authHeaders() {
  const token = await adminToken();
  return { Authorization: `Bearer ${token}` };
}

describe('API CRUD', function () {
  this.timeout(15000);

  before(async () => {
    await init();
    await seed();
    await run('DELETE FROM sessions');
  });

  it('creates and fetches a book', async () => {
    const headers = await authHeaders();
    const isbn = `9${Date.now()}1`.slice(0, 13);
    const payload = {
      isbn,
      title: `Test Book ${Date.now()}`,
      category: 'Test',
      publicationDate: tomorrow(),
      totalCopies: 2,
      copiesAvailable: 2
    };
    const create = await request(app).post('/books').set(headers).send(payload);
    expect(create.status).to.equal(201);
    const getRes = await request(app).get(`/books/${isbn}`).set(headers);
    expect(getRes.status).to.equal(200);
    expect(getRes.body.data.isbn).to.equal(isbn);
  });

  it('creates a member and borrows/returns a book', async () => {
    const headers = await authHeaders();
    const suffix = Date.now();
    const memberPayload = {
      username: `member${suffix}`,
      email: `member${suffix}@example.com`,
      password: 'pass1234',
      name: `Member ${suffix}`,
      phone: `+1${suffix}`
    };
    const mRes = await request(app).post('/members').set(headers).send(memberPayload);
    expect(mRes.status).to.equal(201);
    const memberId = mRes.body.data.memberId;

    const books = await request(app).get('/books').set(headers);
    expect(books.status).to.equal(200);
    const available = (books.body.data || []).find((b) => Number(b.copiesAvailable) > 0);
    expect(available, 'need an available book').to.exist;

    const loanRes = await request(app)
      .post('/loans/borrow')
      .set(headers)
      .send({ isbn: available.isbn, memberId });
    expect(loanRes.status).to.equal(201);
    const loanId = loanRes.body.data.loanId;

    const returnRes = await request(app).post('/loans/return').set(headers).send({ loanId });
    expect(returnRes.status).to.equal(200);
  });

  it('rejects bad login', async () => {
    const res = await request(app).post('/auth/login').send({ username: 'admin', password: 'wrong' });
    expect(res.status).to.equal(401);
    expect((res.body.error.message || '').toLowerCase()).to.include('invalid');
  });
});
