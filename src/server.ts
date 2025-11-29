import { createServer } from 'http';
import { createApp } from './app';
import { getConfig } from './utils/config';
import { info, error as logError } from './utils/logger';
import { shutdownPrisma } from './utils/prisma';

const app = createApp();
const server = createServer(app);
const { port } = getConfig();

/**
 * Starts the HTTP server.
 * @returns void
 */
function start(): void {
  server.listen(port, () => info(`API listening on port ${port}`));
}

/**
 * Performs graceful shutdown on SIGINT/SIGTERM.
 * @param signal OS signal triggering shutdown.
 * @returns Promise resolving when shutdown completes.
 */
async function gracefulShutdown(signal: NodeJS.Signals): Promise<void> {
  info(`Received ${signal}, shutting down...`);
  server.close(async (closeErr) => {
    if (closeErr) {
      logError('Error closing server', closeErr);
      process.exit(1);
    }
    await shutdownPrisma();
    process.exit(0);
  });
}

process.on('SIGINT', () => {
  void gracefulShutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void gracefulShutdown('SIGTERM');
});

start();
