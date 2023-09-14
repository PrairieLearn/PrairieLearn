import winston = require('winston');
import Transport = require('winston-transport');
import { Writable, type WritableOptions } from 'node:stream';

import { config } from './config';

interface WinstonBufferedLogger extends winston.Logger {
  getBuffer(): Buffer;
}

export class BufferedWritableStream extends Writable {
  buffer: any[];

  constructor(options?: WritableOptions) {
    super(options);
    this.buffer = [];
  }

  _write(chunk: any, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.buffer.push(chunk);
    callback();
  }

  getBuffer() {
    return Buffer.concat(this.buffer);
  }
}

export function makeJobLogger(): WinstonBufferedLogger {
  const transports: Transport[] = [];

  const bufferedStream = new BufferedWritableStream();

  if (config.useConsoleLoggingForJobs) {
    transports.push(
      new winston.transports.Console({
        format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
      }),
    );
  }

  transports.push(new winston.transports.Stream({ stream: bufferedStream }));

  const logger = winston.createLogger({ transports });

  return Object.assign(logger, {
    getBuffer() {
      return bufferedStream.getBuffer();
    },
  });
}
