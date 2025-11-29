import dotenv from 'dotenv';
import request from 'supertest';
import { prisma } from '../src/utils/prisma';
import { createApp } from '../src/app';
import { hashPassword } from '../src/utils/password';

dotenv.config();

export const app = createApp();

/**
 * Hard reset database in the right order.
 * - Deletes child tables first to satisfy FK constraints.
 * - Resets identity counters (SQL Server) so tests stay predictable.
 */
export async function resetDatabase(): Promise<void> {
  // Delete in dependency order
  await prisma.fine.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.loan.deleteMany();
  await prisma.wrote.deleteMany();
  await prisma.book.deleteMany();
  await prisma.author.deleteMany();
  await prisma.publisher.deleteMany();
  await prisma.adminUser.deleteMany();
  await prisma.member.deleteMany();
  await prisma.user.deleteMany();

  // Reset identities (SQL Server). Ignore errors if table names differ.
  // Prisma keeps the real table names via @@map.
  await prisma.$executeRawUnsafe(`
    BEGIN TRY DBCC CHECKIDENT ('FINE', RESEED, 0); END TRY BEGIN CATCH END CATCH;
    BEGIN TRY DBCC CHECKIDENT ('RESERVATION', RESEED, 0); END TRY BEGIN CATCH END CATCH;
    BEGIN TRY DBCC CHECKIDENT ('LOAN', RESEED, 0); END TRY BEGIN CATCH END CATCH;
    BEGIN TRY DBCC CHECKIDENT ('AUTHOR', RESEED, 0); END TRY BEGIN CATCH END CATCH;
    BEGIN TRY DBCC CHECKIDENT ('PUBLISHER', RESEED, 0); END TRY BEGIN CATCH END CATCH;
    BEGIN TRY DBCC CHECKIDENT ('ADMIN_USER', RESEED, 0); END TRY BEGIN CATCH END CATCH;
    BEGIN TRY DBCC CHECKIDENT ('MEMBER', RESEED, 0); END TRY BEGIN CATCH END CATCH;
    BEGIN TRY DBCC CHECKIDENT ('USER', RESEED, 0); END TRY BEGIN CATCH END CATCH;
  `);
}

/**
 * Seeds a default admin user for tests and returns token + userId.
 */
export async function seedAdmin(): Promise<{ token: string; userId: number }> {
  const passwordHash = await hashPassword('AdminPass123!');

  const adminUser = await prisma.user.create({
    data: {
      username: 'admin',
      email: 'admin@example.com',
      passwordHash,
      userRole: 'Admin',
      admin: { create: {} }
    }
  });

  const res = await request(app)
    .post('/auth/login')
    .send({ username: 'admin', password: 'AdminPass123!' });

  // Make failures obvious
  if (!res.body?.data?.token) {
    throw new Error(`seedAdmin: login failed. Status=${res.status} Body=${JSON.stringify(res.body)}`);
  }

  return { token: res.body.data.token, userId: adminUser.userId };
}

/**
 * Registers and logs in a member, returns token + userId.
 */
export async function registerAndLoginMember(
  username: string
): Promise<{ token: string; userId: number }> {
  const registerRes = await request(app).post('/auth/register').send({
    username,
    email: `${username}@example.com`,
    password: 'Password123!',
    name: 'Test Member'
  });

  if (registerRes.status >= 400) {
    throw new Error(
      `registerAndLoginMember: register failed. Status=${registerRes.status} Body=${JSON.stringify(
        registerRes.body
      )}`
    );
  }

  const loginRes = await request(app)
    .post('/auth/login')
    .send({ username, password: 'Password123!' });

  if (!loginRes.body?.data?.token || !loginRes.body?.data?.user?.userId) {
    throw new Error(
      `registerAndLoginMember: login failed. Status=${loginRes.status} Body=${JSON.stringify(loginRes.body)}`
    );
  }

  return { token: loginRes.body.data.token, userId: loginRes.body.data.user.userId };
}

afterAll(async () => {
  await prisma.$disconnect();
});
