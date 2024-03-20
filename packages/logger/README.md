# `@prairielearn/logger`

Provides a shared [Winston](https://github.com/winstonjs/winston) instance for all logging.

## Usage

```ts
import { logger, addFileLogging } from '@prairielearn/logger';

// Log all messages to a file.
addFileLogging({ filename: '/path/to/file.log' });

// Log all errors to another file.
addFileLogging({ filename: '/path/to/errors.log', level: 'error' });

logger.debug('verbose');
logger.verbose('verbose');
logger.info('info');
logger.warn('warn');

try {
  await mightError();
} catch (err) {
  // When logging an error, ensure that the first argument is a string. You can
  // pass the error object as the second argument if desired.
  logger.error('An error occurred', err);
}
```
