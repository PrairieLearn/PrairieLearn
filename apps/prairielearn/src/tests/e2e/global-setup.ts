import { execSync } from 'node:child_process';

import { REPOSITORY_ROOT_PATH } from '../../lib/paths.js';
import { createTemplate, databaseExists } from '../helperDb.js';

const POSTGRES_DATABASE_TEMPLATE = 'pltest_template';

export default async function globalSetup() {
  // Every worker runs the built server (see `utils/server.ts`), so build it and
  // the packages it depends on first. This way a run can never use a stale
  // build. Turborepo makes this fast when nothing has changed, including in CI,
  // where `make build` has already run.
  execSync(
    'pnpm turbo run build --filter=@prairielearn/prairielearn... --output-logs=errors-only',
    {
      cwd: REPOSITORY_ROOT_PATH,
      stdio: 'inherit',
    },
  );

  // We setup the template once, so that each worker does not try to create it.
  const templateExists = await databaseExists(POSTGRES_DATABASE_TEMPLATE);
  if (!templateExists) {
    await createTemplate();
  }
}
