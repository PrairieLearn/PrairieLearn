import { recoverStaleWorkflows } from '@prairielearn/workflows';

export async function run() {
  await recoverStaleWorkflows();
}
