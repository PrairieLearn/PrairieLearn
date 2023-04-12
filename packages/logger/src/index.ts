import { createLogger, transports } from 'winston';
import { format } from 'logform';

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
    })
  );
}
