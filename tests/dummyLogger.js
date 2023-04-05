const stream = require('stream');
const winston = require('winston');

const logStream = new stream.Writable();
const messages = [];

logStream._write = (chunk, encoding, next) => {
  const logString = chunk.toString('utf8');
  const logObject = JSON.parse(logString);
  messages.push(logObject.message);
  next();
};

const streamTransport = new winston.transports.Stream({ stream: logStream });
const logger = winston.createLogger({ transports: [streamTransport] });

logger.getOutput = () => {
  return messages.join('\n');
};

module.exports = logger;
