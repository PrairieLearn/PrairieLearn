import * as stream from 'stream';
import winston = require('winston');

interface MockLogger {
  logger: winston.Logger;
  getOutput: () => string;
}

export function makeMockLogger(): MockLogger {
  const logStream = new stream.Writable();
  const messages: string[] = [];

  logStream._write = (chunk, encoding, next) => {
    const logString = chunk.toString('utf8');
    const logObject = JSON.parse(logString);
    messages.push(logObject.message);
    next();
  };

  const streamTransport = new winston.transports.Stream({ stream: logStream });
  const logger = winston.createLogger({ transports: [streamTransport] });

  const getOutput = () => {
    return messages.join('\n');
  };

  return { logger, getOutput };
}
