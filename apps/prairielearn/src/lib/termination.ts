import { logger } from '@prairielearn/logger';

let gracefulShutdownSource: string | null = null;

export function triggerGracefulShutdown(source: string): boolean {
  if (gracefulShutdownSource !== null) {
    logger.info(
      `Ignoring graceful shutdown trigger from ${source}; already triggered by ${gracefulShutdownSource}`,
    );
    return false;
  }

  gracefulShutdownSource = source;
  logger.info(`Triggering graceful shutdown (source: ${source})`);
  process.kill(process.pid, 'SIGTERM');
  return true;
}

export function recordGracefulShutdownSignal(source: string): string {
  gracefulShutdownSource ??= source;
  return gracefulShutdownSource;
}
