# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Plan: Remove `admin_assessment_question_number` sproc

## Context

The `admin_assessment_question_number` SQL stored procedure computes a formatted question number string for instructor/admin views. It takes an `assessment_question_id` and returns either `"3"` (single question in group) or `"3.2"` (multiple questions in group). This logic is simple enough to inline, and moving it to TypeScript with full row returns improves type safety and consistency with the re...

