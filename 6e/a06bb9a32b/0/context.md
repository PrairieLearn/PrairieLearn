# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Remove `assessment_instance_label` sproc

## Context

The `assessment_instance_label` SQL stored procedure computes a display label for assessment instances (e.g. "HW1", "Q3#2") by concatenating `assessment_set.abbreviation + assessment.number`, plus `#instance_number` for multi-instance assessments. This logic is simple enough to live in TypeScript. The sproc is called in 3 SQL files, and the calling queries already return full row objects for the constituent ta...

