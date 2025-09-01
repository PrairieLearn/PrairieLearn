import { test as setup } from '@playwright/test';

import * as helperDb from '../helperDb.js';

setup('create new database', async () => {
  // Importantly, this should run after the dev server is started.
  await helperDb.before();
});
