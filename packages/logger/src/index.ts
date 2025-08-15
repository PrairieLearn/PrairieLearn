import { format } from 'logform';
import { createLogger, transports } from 'winston';

export const logger = createLogger({
  transports: [
    new transports.Console({
      level: 'info',
      format: format.combine(
        format((info) => {
          // If info is an Error object with data from a code caller, we will log
          // the stdout and stderr from the code caller separately.

          // We avoid logging the stdout and stderr in this transport to avoid
          // duplicating the output in multiple locations.
          const { data, ...infoRest } = info;
          const {
            outputStdout: _outputStdout,
            outputStderr: _outputStderr,
            outputBoth: _outputBoth,
            ...dataRest
          } = (data ?? {}) as any;
          return { ...infoRest, data: info.data ? dataRest : undefined };
        })(),
        format.colorize(),
        format.simple(),
      ),
    }),
    // Format outputStdout and outputStderr as separate lines.
    // This will come from info.data if info is an Error object.
    new transports.Console({
      level: 'error',
      format: format.combine(
        format((info) => {
          const { outputStdout, outputStderr } = (info?.data ?? {}) as any;
          if (typeof outputStdout === 'string' && outputStdout.length > 0) {
            return info;
          }
          if (typeof outputStderr === 'string' && outputStderr.length > 0) {
            return info;
          }
          return false;
        })(),
        format.printf((info) => {
          const { outputStdout, outputStderr } = (info?.data ?? {}) as any;
          let output = '';
          if (typeof outputStdout === 'string' && outputStdout.length > 0) {
            output += `[stdout] ${outputStdout}`;
          }

          if (typeof outputStderr === 'string' && outputStderr.length > 0) {
            output += `[stderr] ${outputStderr}`;
          }

          return output;
        }),
      ),
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
