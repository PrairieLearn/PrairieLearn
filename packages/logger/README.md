# `@prairielearn/logger`

Provides a shared [Pino](https://getpino.io/) logger with JSON output.

## Usage

```ts
import { logger, addFileLogging, reopenFileLogging } from '@prairielearn/logger';

// Log all messages to a file.
addFileLogging({ filename: '/path/to/file.log' });

// Log all errors to another file.
addFileLogging({ filename: '/path/to/errors.log', level: 'error' });

// Reopen configured log files after an external tool rotates them.
process.on('SIGHUP', reopenFileLogging);

logger.debug('debug');
logger.verbose('verbose');
logger.info('info');
logger.warn('warn');

try {
  await mightError();
} catch (err) {
  logger.error('An error occurred', err);
}
```
