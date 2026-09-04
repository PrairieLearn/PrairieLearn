# Question patterns

Adapt examples in `../assets/questions/`. Their metadata and HTML follow PL's
`docs/question/overview.md`, `docs/question/template.md`, and the multiple-choice and number-input
templates in `exampleCourse/questions/template/`.

## Fixed multiple choice

`dynamicProgramming/overlappingSubproblems/` contains `info.json` and `question.html`; no Python is
needed. A `pl-question-panel` contains the prompt. A `pl-multiple-choice` outside the panel contains
`pl-answer` children with exactly one `correct="true"`. Use a unique `answers-name` within each
question. Choices shuffle by default: do not refer to “option A” or depend on their order.
`singleVariant: true` is appropriate for this fixed prompt.

An answer panel explains the answer without exposing it in the prompt. The element handles grading;
do not write a custom `grade()` for ordinary multiple choice.

## Randomized numeric answer

`dynamicProgramming/staircase/` adds `server.py`. In `generate(data)`, assign JSON-serializable
values to `data["params"]` and expected answers to `data["correct_answers"]`. Use Mustache such as
`{{params.n}}` in HTML and match the input's `answers-name` to its answer key. The example uses
`comparison="integer"` because the answer is a count.

The recurrence is ways(0) = ways(1) = 1 and ways(n) = ways(n-1) + ways(n-2). The prompt explicitly
allows steps of size 1 or 2 and counts different orders separately. The loop computes the answer
for a small random n without external dependencies or custom grading.

## Metadata and files

Use a fresh UUID, meaningful title, `type: "v3"`, and an existing course topic. Replace the example
topic `Algorithms` with a course topic rather than unnecessarily changing course metadata. Retain
existing tags/authors/settings when editing. Do not copy public-source-sharing settings into
private content. Keep solutions and server code out of `clientFilesQuestion/` and
`clientFilesCourse/`, which students can download. Read element docs before using unfamiliar
attributes.
