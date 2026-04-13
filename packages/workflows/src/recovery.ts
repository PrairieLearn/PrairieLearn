import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';

import { WorkflowRunSchema } from './types.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

/**
 * Finds workflow runs with stale heartbeats (status = 'running' but no
 * heartbeat update in over 2 minutes) and attempts to resume them.
 *
 * This should be called periodically by a cron job in the consuming
 * application.
 */
export async function recoverStaleWorkflows(): Promise<void> {
  const staleRuns = await sqldb.queryRows(sql.select_stale_workflows, {}, WorkflowRunSchema);

  if (staleRuns.length === 0) return;

  logger.info(`Found ${staleRuns.length} stale workflow run(s), attempting recovery`);

  // Dynamic import to avoid circular dependency.
  const { resumeWorkflow, getWorkflowRun } = await import('./workflows.js');

  for (const staleRun of staleRuns) {
    try {
      // Re-read to get latest state.
      const run = await getWorkflowRun(staleRun.id);

      if (run.status !== 'running') {
        // Status changed since our query — skip.
        continue;
      }

      // The lock was stale, so clear it and set status to waiting_for_input
      // so resumeWorkflow can pick it up.
      await sqldb.execute(sql.clear_stale_lock, { id: run.id });

      await resumeWorkflow(run.id);
      logger.info(`Recovered stale workflow ${run.id}`);
    } catch (err) {
      logger.error(`Failed to recover stale workflow ${staleRun.id}`, err);
    }
  }
}
