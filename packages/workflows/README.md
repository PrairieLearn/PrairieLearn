# `@prairielearn/workflows`

A database-backed engine for running durable, multi-step workflows with pause/resume support for human-in-the-loop interactions.

## Usage

### Initialization

The workflow engine is initialized automatically in `server.ts` at startup. It uses its own Postgres connection pool to avoid deadlocks with long-running workflow soft locks.

```ts
import * as workflows from '@prairielearn/workflows';

await workflows.init(pgConfig, idleErrorHandler);
workflows.startRecoveryLoop(); // starts crash-recovery polling
```

### Defining a workflow

Register a workflow by providing a `type` (unique identifier) and a `takeStep` function. The engine calls `takeStep` in a loop — all control flow lives in your step function, not in the engine.

The following example is based on the upcoming rubric assistant workflow, which will help instructors generate and edit grading rubrics. The workflow pauses to wait for instructor input between steps, demonstrating the engine's pause/resume support.

The workflow moves through these steps:

1. **`rubric_check`** — Checks whether a rubric already exists for the question. Pauses to let the instructor decide what to do next.
2. **`awaiting_input`** / **`rubric_ready`** — Idle states where the workflow waits for the instructor to send a message (e.g. "generate a rubric" or "add an item for code style").
3. **`agent_running`** — Runs the LLM to generate or edit the rubric based on the instructor's message. When done, returns to `rubric_ready` to wait for the next instruction.

```ts
import { registerWorkflow } from '@prairielearn/workflows';

type RubricAssistantStep = 'rubric_check' | 'rubric_ready' | 'awaiting_input' | 'agent_running';

interface RubricAssistantState {
  step: RubricAssistantStep;
  rubric_exists?: boolean;
  message_id?: string;
  user_message?: string;
}

registerWorkflow<RubricAssistantState>({
  type: 'rubric_assistant',
  async takeStep({ run, logger }) {
    switch (run.state.step) {
      // Step 1: Check if a rubric already exists for this question.
      // Pauses afterward so the instructor can decide what to do.
      case 'rubric_check': {
        logger.info('Checking if rubric exists');
        const rubricData = await selectRubricData(run.context.assessment_question_id);

        if (rubricData) {
          return {
            state: { ...run.state, step: 'rubric_ready', rubric_exists: true },
            status: 'waiting',
          };
        } else {
          return {
            state: { ...run.state, step: 'awaiting_input', rubric_exists: false },
            status: 'waiting',
          };
        }
      }

      // Step 2: Run the LLM to generate or edit the rubric based on
      // the instructor's message. Returns to rubric_ready when done.
      case 'agent_running': {
        logger.info(`Running LLM for step ${run.state.step}`);
        await runAgent(run);
        return {
          state: { step: 'rubric_ready', rubric_exists: true },
          status: 'waiting',
        };
      }

      // Idle states: wait for the instructor to send a message.
      // continueWorkflow() merges their input into state and
      // transitions to 'agent_running'.
      case 'rubric_ready':
      case 'awaiting_input':
        return { state: run.state, status: 'waiting' };

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

The engine does not infer your workflow's state type from the registered `type` string, so each call below — `startWorkflow`, `continueWorkflow`, `getWorkflowRun`, `getActiveWorkflowRun` — takes the state type as an explicit type parameter (`<RubricAssistantState>` in these examples).

If not specified, the state falls back to `Record<string, unknown>`, which silently disables compile-time checking of `initialState`, state updates, and `run.state` access.

### Starting a workflow

```ts
import { startWorkflow } from '@prairielearn/workflows';

const run = await startWorkflow<RubricAssistantState>('rubric_assistant', {
  initialState: { step: 'rubric_check' },
  context: { assessment_question_id: '42', course_id: '1' },
});
// run.id is the workflow run ID
// run.status is 'running' — the step loop continues in the background
```

The `context` field stores domain-specific identifiers as string key/value pairs alongside the run for querying. The engine never inspects it. You can add your own indexes on `context` fields via standard migrations.

### Pausing for external input

When a step returns `status: 'waiting'`, the workflow pauses — for example, waiting for a human response before making an LLM call. Call `continueWorkflow` to merge new data into state and resume:

```ts
import { continueWorkflow } from '@prairielearn/workflows';

// An instructor sends a chat message on the manual grading page;
// the POST handler resumes the paused workflow with their input.
await continueWorkflow<RubricAssistantState>(run.id, {
  step: 'agent_running',
  user_message: 'Add a rubric item for code style',
  message_id: newMessageId,
});
// Merges the update into state and resumes the step loop
```

> **Note:** `continueWorkflow` performs a shallow merge using Postgres `jsonb ||`. Top-level keys in the update replace existing keys, but nested objects are replaced entirely rather than recursively merged. If you need to update a nested value, fetch the current state, merge client-side, and pass the full top-level key.

### Querying

```ts
import { getWorkflowRun, getActiveWorkflowRun } from '@prairielearn/workflows';

// Fetch a specific run by ID
const run = await getWorkflowRun<RubricAssistantState>(runId);

// Find the most recent active run matching type + context
const active = await getActiveWorkflowRun<RubricAssistantState>('rubric_assistant', {
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

| Status        | Engine behavior                                      |
| ------------- | ---------------------------------------------------- |
| `'continue'`  | Persist state, call `takeStep` again immediately     |
| `'waiting'`   | Persist state, pause until `continueWorkflow` called |
| `'completed'` | Persist state, mark run as finished                  |
| `'error'`     | Persist state + `error_message`, mark run as failed  |

### Crash recovery

The engine uses soft locks with heartbeats. If a server crashes mid-step, the recovery loop (started by `startRecoveryLoop()`) detects the stale heartbeat and resumes the workflow from its last persisted state on another server.
