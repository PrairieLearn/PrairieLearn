# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Remove `assessments_format_for_question` sproc

## Context

The `assessments_format_for_question` sproc builds a JSONB array of `{ label, assessment_id, course_instance_id, share_source_publicly, color }` by hand-picking columns from `assessments` and `assessment_sets`. We want to replace it with inline SQL using `to_jsonb()` full-row returns and compute derived values (like `label`) in TypeScript.

## Call sites

1. **`apps/prairielearn/src/models/questions.sql:...

### Prompt 2

why is it both nullable and optional?

### Prompt 3

can you have it default to an empty array, so its just optional

### Prompt 4

can't you update the sql instead of doing it in zod

