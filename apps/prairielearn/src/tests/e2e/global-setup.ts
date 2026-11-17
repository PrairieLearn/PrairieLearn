import { execSync } from 'node:child_process';

import { REPOSITORY_ROOT_PATH } from '../../lib/paths.js';
import { createTemplate, dropTemplate } from '../helperDb.js';

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

  // Recreate the template that every worker clones its database from, as
  // Vitest does. Reusing an existing one would leave out migrations added since
  // it was created (workers don't run migrations), and it only takes a few
  // seconds to rebuild.
  await createTemplate();

  // Playwright runs a function returned from global setup as global teardown.
  return dropTemplate;
}
