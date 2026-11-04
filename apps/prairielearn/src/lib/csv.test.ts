import { setImmediate } from 'node:timers/promises';

import { expect, test } from 'vitest';

import { createCsvParser } from './csv.js';

test('handles malformed CSV when iteration starts after an async gap', async () => {
  const parser = createCsvParser(Buffer.from('uid,group_name\nnot"csv,group\n'));

  await setImmediate();

  await expect(parser.next()).rejects.toMatchObject({ code: 'INVALID_OPENING_QUOTE' });
});
