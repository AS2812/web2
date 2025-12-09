const path = require('path');
process.env.NODE_ENV = 'test';
process.env.DB_PATH = process.env.DB_PATH || path.join(__dirname, 'test.db');
const request = require('supertest');
const { expect } = require('chai');
const { app } = require('../server');
const { init, seed, run } = require('../db');

describe('Auth & sessions', function () {
  this.timeout(10000);

  before(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
    await init();
    await seed();
    await run('DELETE FROM sessions');
    await run('DELETE FROM password_resets');
  });

  afterEach(async () => {
    await run('DELETE FROM sessions');
  });

  it('logs in admin and returns a token', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ username: 'admin', password: process.env.ADMIN_PASSWORD || 'admin123' });
    expect(res.status).to.equal(200);
    expect(res.body?.data?.token).to.be.a('string');
  });

  it('replaces prior active session on new login', async () => {
    const creds = { username: 'admin', password: process.env.ADMIN_PASSWORD || 'admin123' };
    const first = await request(app).post('/auth/login').send(creds);
    expect(first.status).to.equal(200);
    const token1 = first.body?.data?.token;
    const second = await request(app).post('/auth/login').send(creds);
    expect(second.status).to.equal(200);
    const token2 = second.body?.data?.token;
    expect(token2).to.be.a('string');
    // old token should now be invalid because session was replaced
    const meOld = await request(app).get('/auth/me').set('Authorization', `Bearer ${token1}`);
    expect(meOld.status).to.equal(401);
  });

  it('rejects duplicate email on register', async () => {
    const unique = Date.now().toString();
    const email = `user${unique}@example.com`;
    const payload = {
      username: `user${unique}`,
      email,
      password: 'password1',
      name: `Test User ${unique}`
    };
    const first = await request(app).post('/auth/register').send(payload);
    expect(first.status).to.equal(201);
    const second = await request(app).post('/auth/register').send(payload);
    expect(second.status).to.equal(409);
  });

  it('requires auth for protected route', async () => {
    const res = await request(app).get('/members');
    expect(res.status).to.equal(401);
  });
});
