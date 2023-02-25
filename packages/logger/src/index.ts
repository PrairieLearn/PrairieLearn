import winston from 'winston';
import { format } from 'logform';

export const logger = winston.createLogger({
  transports: [
    new winston.transports.Console({
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
    new winston.transports.File({
      filename: options.filename,
      level: options.level ?? 'debug',
      format: format.combine(format.timestamp(), format.json()),
    })
  );
}
