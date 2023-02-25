# `@prairielearn/logger`

Provides a shared [Winston](https://github.com/winstonjs/winston) instance for all logging.

## Usage

```ts
import { logger, enableFileLogging } from '@prairielearn/logger';

enableFileLogging('/path/to/file.log');

logger.info('info');
logger.verbose('verbose');
logger.warn('warn');

try {
  await mightError();
} catch (err) {
  // When logging an error, ensure that the first argument is a string. You can
  // pass the error object as the second argument if desired.
  logger.error('An error occurred', err);
}
```
