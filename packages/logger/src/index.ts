import pino, { type Logger as PinoLogger } from 'pino';

type LogLevel = 'debug' | 'verbose' | 'info' | 'warn' | 'error';

type LogFunction = (messageOrObject: unknown, ...metadata: unknown[]) => void;

type Logger = Omit<PinoLogger<'verbose'>, LogLevel> & Record<LogLevel, LogFunction>;

interface AddFileLoggingOptions {
  filename: string;
  level?: LogLevel;
}

type FileLoggingDestination = ReturnType<typeof pino.destination>;

const VERBOSE_LEVEL = 25;

const output = pino.multistream<LogLevel>([{ level: 'info', stream: process.stdout }], {
  levels: { verbose: VERBOSE_LEVEL },
});

function normalizeLogArguments(args: unknown[]): unknown[] {
  const [message, metadata, ...remainingMetadata] = args;
  if (typeof message !== 'string' || metadata === null || typeof metadata !== 'object') {
    return args;
  }

  return [metadata instanceof Error ? { err: metadata } : metadata, message, ...remainingMetadata];
}

const pinoLogger = pino<'verbose'>(
  {
    base: null,
    customLevels: { verbose: VERBOSE_LEVEL },
    formatters: {
      level: (level) => ({ level }),
    },
    hooks: {
      logMethod(args, method) {
        method.apply(this, normalizeLogArguments(args) as Parameters<typeof method>);
      },
    },
    level: 'debug',
    messageKey: 'message',
    timestamp: () => `,"timestamp":${JSON.stringify(new Date().toISOString())}`,
  },
  output,
);

export const logger = pinoLogger as unknown as Logger;

/**
 * Temporarily silence all logger output while executing the provided function.
 *
 * @param fn - The function to run with the logger silenced.
 * @returns The result of the function.
 */
export async function withoutLogging<T>(fn: () => T | Promise<T>): Promise<T> {
  const originalLevel = logger.level;
  logger.level = 'silent';
  try {
    return await fn();
  } finally {
    logger.level = originalLevel;
  }
}

const fileLoggingDestinations: FileLoggingDestination[] = [];

export function addFileLogging(options: AddFileLoggingOptions) {
  const destination = pino.destination({ dest: options.filename, sync: false });
  fileLoggingDestinations.push(destination);
  output.add({ level: options.level ?? 'debug', stream: destination });
}

/** Reopen all file logging destinations after external log rotation. */
export function reopenFileLogging() {
  fileLoggingDestinations.forEach((destination) => destination.reopen());
}
