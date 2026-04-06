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

The following example is based on the AI grading workflow, which uses an LLM agent to generate or edit rubrics for manual grading questions. The workflow pauses for human input between steps.

```ts
import { registerWorkflow } from '@prairielearn/workflows';

interface AiGradingState {
  step: string;
  phase?: 'generate' | 'edit';
  rubric_exists?: boolean;
  message_id?: string;
  user_message?: string;
}

registerWorkflow<AiGradingState>({
  type: 'ai_grading',
  async takeStep({ run, logger }) {
    switch (run.state.step) {
      case 'rubric_check': {
        logger.info('Checking if rubric exists');
        const rubricData = await selectRubricData(run.context.assessment_question_id);

        if (rubricData) {
          return {
            state: { ...run.state, step: 'rubric_ready', rubric_exists: true },
            status: 'waiting_for_input',
            phase: 'rubric_setup',
          };
        } else {
          return {
            state: { ...run.state, step: 'awaiting_input', rubric_exists: false },
            status: 'waiting_for_input',
            phase: 'rubric_setup',
          };
        }
      }

      case 'agent_running': {
        logger.info(`Running agent — phase: ${run.state.phase}`);
        // Run the LLM agent, stream results via Redis, finalize the message.
        await runAgent(run);
        return {
          state: { step: 'rubric_ready', rubric_exists: true },
          status: 'waiting_for_input',
          phase: 'rubric_setup',
        };
      }

      case 'rubric_ready':
      case 'awaiting_input':
        return { state: run.state, status: 'waiting_for_input', phase: 'rubric_setup' };

      default:
        return {
          state: run.state,
          status: 'error',
          error_message: `Unknown step: ${run.state.step}`,
        };
    }
  },
});
```

### Starting a workflow

```ts
import { startWorkflow } from '@prairielearn/workflows';

const run = await startWorkflow('ai_grading', {
  initialState: { step: 'rubric_check' },
  context: { assessment_question_id: '42', course_id: '1' },
});
// run.id is the workflow run ID
// run.status is 'running' — the step loop continues in the background
```

The `context` field stores domain-specific identifiers alongside the run for querying. The engine never inspects it. You can add your own indexes on `context` fields via standard migrations.

### Human-in-the-loop

When a step returns `status: 'waiting_for_input'`, the workflow pauses. To resume it, call `continueWorkflow` with new data to merge into state:

```ts
import { continueWorkflow } from '@prairielearn/workflows';

await continueWorkflow(run.id, {
  step: 'agent_running',
  phase: 'edit',
  user_message: 'Add a rubric item for code style',
  message_id: newMessageId,
});
// Merges the update into state and resumes the step loop
```

### Querying

```ts
import { getWorkflowRun, getActiveWorkflowRun } from '@prairielearn/workflows';

// Fetch a specific run by ID
const run = await getWorkflowRun(runId);

// Find the most recent active run matching type + context
const active = await getActiveWorkflowRun('ai_grading', {
  assessment_question_id: '42',
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
