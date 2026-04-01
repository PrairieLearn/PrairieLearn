# `@prairielearn/workflows`

A database-backed engine for running durable, multi-step workflows with pause/resume support for human-in-the-loop interactions.

## Usage

### Initialization

The workflow engine is initialized automatically in `server.ts` at startup. It uses its own Postgres connection pool to avoid deadlocks with long-running workflow soft locks.

```ts
import * as workflows from '@prairielearn/workflows';

await workflows.init(pgConfig, idleErrorHandler);
workflows.startCronLoop(); // starts crash-recovery polling
```

### Defining a workflow

Register a workflow by providing a `type` (unique identifier) and a `takeStep` function. The engine calls `takeStep` in a loop — all control flow lives in your step function, not in the engine.

```ts
import { registerWorkflow } from '@prairielearn/workflows';

registerWorkflow<{ phase: string; draft?: string; approved?: boolean }>({
  type: 'report_generation',
  async takeStep({ run, logger }) {
    switch (run.state.phase) {
      case 'generate': {
        logger.info('Generating draft report');
        const draft = await generateReport();
        return {
          state: { phase: 'review', draft },
          status: 'waiting_for_input',
          phase: 'awaiting-review',
        };
      }
      case 'review': {
        if (!run.state.approved) {
          return {
            state: run.state,
            status: 'error',
            error_message: 'Report was rejected',
          };
        }
        await publishReport(run.state.draft!);
        return {
          state: { ...run.state, phase: 'done' },
          status: 'completed',
          phase: 'published',
        };
      }
      default:
        return {
          state: run.state,
          status: 'error',
          error_message: `Unknown phase: ${run.state.phase}`,
        };
    }
  },
});
```

### Starting a workflow

```ts
import { startWorkflow } from '@prairielearn/workflows';

const run = await startWorkflow('report_generation', {
  initialState: { phase: 'generate' },
  context: { course_id: 1, user_id: 42 },
});
// run.id is the workflow run ID
// run.status is 'running' — the step loop continues in the background
```

The `context` field stores domain-specific identifiers alongside the run for querying. The engine never inspects it. You can add your own indexes on `context` fields via standard migrations.

### Human-in-the-loop

When a step returns `status: 'waiting_for_input'`, the workflow pauses. To resume it, call `continueWorkflow` with new data to merge into state:

```ts
import { continueWorkflow } from '@prairielearn/workflows';

await continueWorkflow(run.id, { approved: true });
// Merges { approved: true } into state and resumes the step loop
```

### Querying

```ts
import { getWorkflowRun, getActiveWorkflowRun } from '@prairielearn/workflows';

// Fetch a specific run by ID
const run = await getWorkflowRun(runId);

// Find the most recent active run matching type + context
const active = await getActiveWorkflowRun('report_generation', {
  course_id: 1,
});
// Returns null if no active run matches
```

### Cancellation

```ts
import { cancelWorkflow } from '@prairielearn/workflows';

await cancelWorkflow(run.id);
// Sets status to 'canceled', clears the lock, records completed_at
```

### Step function return values

The `status` field controls what the engine does next:

| Status                | Engine behavior                                      |
| --------------------- | ---------------------------------------------------- |
| `'continue'`          | Persist state, call `takeStep` again immediately     |
| `'waiting_for_input'` | Persist state, pause until `continueWorkflow` called |
| `'completed'`         | Persist state, mark run as finished                  |
| `'error'`             | Persist state + `error_message`, mark run as failed  |

### Crash recovery

The engine uses soft locks with heartbeats. If a server crashes mid-step, the crash-recovery cron (started by `startCronLoop()`) detects the stale heartbeat and resumes the workflow from its last persisted state on another server.
