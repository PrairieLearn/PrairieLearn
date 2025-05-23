import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/*',
  // We define these separately to prevent vitest from picking up the apps/README.md file
  'apps/prairielearn',
  'apps/grader-host',
  'apps/workspace-host',
]);
