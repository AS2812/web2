"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
exports.resetDatabase = resetDatabase;
exports.seedAdmin = seedAdmin;
exports.registerAndLoginMember = registerAndLoginMember;
const dotenv_1 = __importDefault(require("dotenv"));
const supertest_1 = __importDefault(require("supertest"));
const prisma_1 = require("../src/utils/prisma");
const app_1 = require("../src/app");
const password_1 = require("../src/utils/password");
dotenv_1.default.config();
exports.app = (0, app_1.createApp)();
/**
 * Removes data from all tables to maintain isolation between tests.
 * @returns Promise resolving when cleanup completes.
 */
async function resetDatabase() {
    await prisma_1.prisma.fine.deleteMany();
    await prisma_1.prisma.reservation.deleteMany();
    await prisma_1.prisma.loan.deleteMany();
    await prisma_1.prisma.wrote.deleteMany();
    await prisma_1.prisma.book.deleteMany();
    await prisma_1.prisma.author.deleteMany();
    await prisma_1.prisma.publisher.deleteMany();
    await prisma_1.prisma.member.deleteMany();
    await prisma_1.prisma.adminUser.deleteMany();
    await prisma_1.prisma.user.deleteMany();
}
/**
 * Seeds a default admin user for tests.
 * @returns Promise resolving to admin token and user id.
 */
async function seedAdmin() {
    const passwordHash = await (0, password_1.hashPassword)('AdminPass123!');
    const adminUser = await prisma_1.prisma.user.create({
        data: {
            username: 'admin',
            email: 'admin@example.com',
            passwordHash,
            userRole: 'Admin',
            admin: {
                create: {}
            }
        }
    });
    const response = await (0, supertest_1.default)(exports.app)
        .post('/auth/login')
        .send({ username: 'admin', password: 'AdminPass123!' });
    return { token: response.body.data.token, userId: adminUser.userId };
}
/**
 * Registers and logs in a member to obtain token and member id.
 * @param username Username to register.
 * @returns Promise with auth token.
 */
async function registerAndLoginMember(username) {
    await (0, supertest_1.default)(exports.app)
        .post('/auth/register')
        .send({
        username,
        email: `${username}@example.com`,
        password: 'Password123!',
        name: 'Test Member'
    });
    const response = await (0, supertest_1.default)(exports.app)
        .post('/auth/login')
        .send({ username, password: 'Password123!' });
    return { token: response.body.data.token, userId: response.body.data.user.userId };
}
afterAll(async () => {
    await prisma_1.prisma.$disconnect();
});
