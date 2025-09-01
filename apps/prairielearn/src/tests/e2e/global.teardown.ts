import { test as teardown } from '@playwright/test';

import * as helperDb from '../helperDb.js';

teardown('delete database', async () => {
  await helperDb.after();
});
