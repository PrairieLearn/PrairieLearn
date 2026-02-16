# Session Context

## User Prompts

### Prompt 1

The changes introduce two functional regressions: client-side validation can be bypassed due to async submit handling, and clearing all tags persists an empty tag value. Both issues
  affect correctness of saved question settings.

  Full review comments:

  - [P1] Prevent default before awaiting async form validation — /Users/peter/work/PrairieLearn/apps/prairielearn/src/pages/instructorQuestionSettings/components/
    QuestionSettingsForm.tsx:227-231
    The submit handler calls await trigge...

