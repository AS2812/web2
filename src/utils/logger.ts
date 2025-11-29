/**
 * Logs informational messages to stdout.
 * @param message Message to log.
 * @param meta Optional metadata to include.
 * @returns void
 */
export function info(message: string, meta?: unknown): void {
  // eslint-disable-next-line no-console
  console.log(`[INFO] ${message}`, meta ?? '');
}

/**
 * Logs warning messages to stdout.
 * @param message Message to log.
 * @param meta Optional metadata to include.
 * @returns void
 */
export function warn(message: string, meta?: unknown): void {
  // eslint-disable-next-line no-console
  console.warn(`[WARN] ${message}`, meta ?? '');
}

/**
 * Logs error messages to stderr.
 * @param message Message to log.
 * @param meta Optional metadata to include.
 * @returns void
 */
export function error(message: string, meta?: unknown): void {
  // eslint-disable-next-line no-console
  console.error(`[ERROR] ${message}`, meta ?? '');
}
