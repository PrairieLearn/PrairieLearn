import { format } from 'logform';
import { createLogger, transports } from 'winston';

/**
 * Temporarily silence all logger output while executing the provided function.
 *
 * @param fn - The function to run with the logger silenced.
 * @returns The result of the function.
 */
export async function withoutLogging<T>(fn: () => T | Promise<T>): Promise<T> {
  const originalSilent = logger.silent;
  logger.silent = true;
  try {
    return await fn();
  } finally {
    logger.silent = originalSilent;
  }
}

export const logger = createLogger({
  transports: [
    new transports.Console({
      level: 'info',
      format: format.combine(format.colorize(), format.simple()),
    }),
  ],
});

interface AddFileLoggingOptions {
  filename: string;
  level?: string;
}

export function addFileLogging(options: AddFileLoggingOptions) {
  logger.add(
    new transports.File({
      filename: options.filename,
      level: options.level ?? 'debug',
      format: format.combine(format.timestamp(), format.json()),
    }),
  );
}
