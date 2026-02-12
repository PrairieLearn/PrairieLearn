# Session Context

## User Prompts

### Prompt 1

./scripts/typecheck-file.sh apps/prairielearn/src/pages/instructorQuestionCreate/components/CreateQuestionForm.tsx fails, but the build succeeds. there is a bug in the typechecking script

### Prompt 2

can you explain this fix more?

Full build (include: ["**/*"]) includes test files that import 'jsdom'. which files are this?

### Prompt 3

thats crazy! can you explain how the test code would get pulled in to a build when i compile that file?

### Prompt 4

seems like an underlying issue in my tsconfig, right? or no. this seems unintended

### Prompt 5

yes, look into it

### Prompt 6

so the src/tsconfig.json right now is intended to prevent DOM at runtime, but because of this include setup, it actually allows it?

Can you give me an expected snipped that would fail

### Prompt 7

Can you capture this in an issue? draft it first. explain the original issue, and show the minimal repro of the bug, and suggest a fix.

### Prompt 8

nope, make the issue

