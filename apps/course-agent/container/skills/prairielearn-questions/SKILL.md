---
name: prairielearn-questions
description: Write, edit, review, or debug PrairieLearn questions (questions/<qid>/ with info.json, question.html, server.py and pl-* elements such as pl-number-input or pl-multiple-choice). Use for any task that creates or changes a question.
---

# PrairieLearn questions

## Workflow

1. Look up the details of each element you plan to use in PrairieLearn's documentation at docs.prairielearn.com.
2. Write the question following the rules below, then reread `question.html` and `server.py` against them before requesting review.

## Rules

- Each question lives in its own directory under `questions/` (`questions/<qid>/` with `info.json`, `question.html`, and optionally `server.py`). `info.json` needs `"uuid"`, `"title"`, `"topic"`, and `"type": "v3"`.
- Input elements (`pl-number-input`, `pl-integer-input`, `pl-symbolic-input`, `pl-multiple-choice`, `pl-checkbox`, …) must not be placed inside `pl-question-panel`, `pl-answer-panel`, or `pl-submission-panel`; they render their own question, submission, and answer views. Put the question text and directions inside one `pl-question-panel`: text outside every panel is repeated in the answer and submission views.
- In `server.py`, `generate(data)` puts random values in `data["params"]`. Set `data["correct_answers"][name]` only for elements that read it (`pl-number-input`, `pl-integer-input`, `pl-string-input`, `pl-symbolic-input`). `pl-multiple-choice` and `pl-checkbox` take correctness from `correct="true"` on their `pl-answer` children, and setting `correct_answers` for them breaks the question. They also store their options under `data["params"][answers-name]`, so never use their `answers-name` as a params key.
- Do any computation, rounding, and LaTeX string building in `server.py`. Never put a Mustache tag directly inside a TeX group, as in `\frac{{params.a}}{{params.b}}`; write `\frac{ {{params.a}} }{ {{params.b}} }` or pass a prebuilt LaTeX string. In HTML attributes, write TeX with single backslashes, e.g. `suffix="$\mathrm{m/s}$"`.
- Format displayed numbers in `server.py`: never show Python e-notation such as `1.2e-05` (write `1.2 \times 10^{-5}` in LaTeX instead). Show displayed values with the precision used to compute the answer. If grading requires a precision (`comparison="sigfig"` or `"decdig"`, or a tight tolerance), tell students in the question text.
- Mustache HTML-escapes `{{params.x}}`. Use triple braces (`{{{params.x}}}`) only for HTML you build in `server.py` from trusted values, never for text that could come from students.
- Keep the question clear, concise, and unambiguous. Present given values as facts without mentioning randomization, and don't explain how to solve the question unless staff ask; that includes hints such as how many options are correct. Give students the model, relationships, and constants they need to solve it, but not the solved expression for the answer: a formula in the request that defines the correct answer is for computing it in `server.py`, so show it only if the request says students should be given it. Put worked solutions in `pl-answer-panel`.

## Editing existing questions

When editing any existing question, read its current files first and change only what the request needs; keep its structure, style, and wording otherwise.

Each student variant keeps the `params` and `correct_answers` that `generate()` produced when it was created, and submissions are stored under each input's `answers-name`. Everything else is read from the current files, including `question.html`, element attributes, `grade()` and `parse()`, so it runs against those saved values.

First decide whether students could have variants. Students only get a question through an assessment, so search for its QID in `courseInstances/*/assessments/**/infoAssessment.json` (questions are listed by `"id"`, including inside `alternatives`). Also check `info.json` for `sharePublicly` or `sharingSets`, which let other courses use it.

- **New or unused question** (you created it in this conversation, or no assessment lists it and it isn't shared): change anything freely.
- **Question in an assessment or shared**: assume students may have started it unless staff say otherwise. You can't see variants or submissions, so follow the rules below and tell staff which assessments use the question.

Rules for questions students may have started:

- Keep the question's directory name (QID), its `uuid`, and every `answers-name`. Renaming an `answers-name` makes existing variants grade correct answers as wrong, with no error.
- Don't rename or remove `params` or `correct_answers` keys. If you add one, existing variants won't have it: read it with `data["params"].get(key, default)` in `grade()`, `parse()` and other code that runs on existing variants, and show it in `question.html` only inside a Mustache section (`{{#params.key}}…{{/params.key}}`) so old variants omit it instead of showing a blank.
- Changes to `generate()` (including the correct answers it sets) or to `pl-multiple-choice`/`pl-checkbox` options reach only new variants; students who already started keep the old version.
- Changes to grading settings in `question.html`, such as tolerances or `comparison`, apply to existing variants on their next submission.
- If a change can't be made compatibly, say so and suggest the options: create a new question (new directory and `uuid`) instead; or, for Homework assessments, staff can reset the question's variants, which discards unsubmitted work. Exam variants can't be reset.
