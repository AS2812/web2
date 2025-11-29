import dotenv from 'dotenv';

dotenv.config();

/**
 * Retrieves strongly typed configuration derived from environment variables.
 * @returns Object containing application configuration values.
 * @throws {Error} When mandatory variables are missing.
 */
export function getConfig() {
  const {
    PORT = '3000',
    DATABASE_URL,
    JWT_SECRET = 'supersecret',
    JWT_EXPIRY = '1h',
    BCRYPT_ROUNDS = '10',
    NODE_ENV = 'development'
  } = process.env;

  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  return {
    port: Number(PORT),
    databaseUrl: DATABASE_URL,
    jwtSecret: JWT_SECRET,
    jwtExpiry: JWT_EXPIRY,
    bcryptRounds: Number(BCRYPT_ROUNDS),
    nodeEnv: NODE_ENV
  };
}
