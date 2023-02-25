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

export function enableFileLogging(filename: string) {
  logger.add(
    new winston.transports.File({
      filename: filename,
      level: 'debug',
      format: format.combine(format.timestamp(), format.json()),
    })
  );
}
