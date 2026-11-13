---
name: prairielearn-questions
description: Write, edit, review, or debug PrairieLearn questions (questions/<qid>/ with info.json, question.html, server.py and pl-* elements such as pl-number-input or pl-multiple-choice). Use for any task that creates or changes a question.
---

# PrairieLearn questions

## Workflow

1. Read the docs for each element you plan to use in `references/docs/elements/<element>.md`, and a similar working example in `references/examples/` (find one with `rg -l '<pl-number-input' references/examples/template`). Use web search only for what these don't cover.
2. Write the question following the rules below.
3. Run `scripts/pl-check questions/<qid>` (paths in this skill are relative to this file's directory) and fix every ERROR before requesting review; fix each WARNING too unless the question intends it. It checks structure and runs `generate()` for several seeds; it does not render elements, so also reread `question.html` for clarity.

## Rules

- Each question lives in its own directory under `questions/` (`questions/<qid>/` with `info.json`, `question.html`, and optionally `server.py`). `info.json` needs `"uuid"`, `"title"`, `"topic"`, and `"type": "v3"`.
- Input elements (`pl-number-input`, `pl-integer-input`, `pl-symbolic-input`, `pl-multiple-choice`, `pl-checkbox`, …) must not be placed inside `pl-question-panel`, `pl-answer-panel`, or `pl-submission-panel`; they render their own question, submission, and answer views. Put the question text and directions inside one `pl-question-panel`: text outside every panel is repeated in the answer and submission views.
- In `server.py`, `generate(data)` puts random values in `data["params"]`. Set `data["correct_answers"][name]` only for elements that read it (`pl-number-input`, `pl-integer-input`, `pl-string-input`, `pl-symbolic-input`). `pl-multiple-choice` and `pl-checkbox` take correctness from `correct="true"` on their `pl-answer` children, and setting `correct_answers` for them breaks the question. They also store their options under `data["params"][answers-name]`, so never use their `answers-name` as a params key.
- Do any computation, rounding, and LaTeX string building in `server.py`. Never put a Mustache tag directly inside a TeX group, as in `\frac{{params.a}}{{params.b}}`; write `\frac{ {{params.a}} }{ {{params.b}} }` or pass a prebuilt LaTeX string. In HTML attributes, write TeX with single backslashes, e.g. `suffix="$\mathrm{m/s}$"`.
- Format displayed numbers in `server.py`: never show Python e-notation such as `1.2e-05` (write `1.2 \times 10^{-5}` in LaTeX instead). Show displayed values with the precision used to compute the answer. If grading requires a precision (`comparison="sigfig"` or `"decdig"`, or a tight tolerance), tell students in the question text.
- Present given values as facts without mentioning randomization, and don't explain how to solve the question unless staff ask. Give students the model, relationships, and constants they need to solve it, but not the solved expression for the answer: a formula in the request that defines the correct answer is for computing it in `server.py`, so show it only if the request says students should be given it. Put worked solutions in `pl-answer-panel`.

## References

These document the PrairieLearn version this agent was deployed with (see `references/VERSION`).

- `references/docs/question/`: how questions work. `overview.md` (directory layout, `info.json`), `template.md` (`question.html`, panels, Mustache), `server.md` (`server.py`: `generate`, `params`, `correct_answers`, `grade`), `runtime.md` (question runtime environment).
- `references/docs/elements/<element>.md`: one page per element (attributes, defaults, examples). `index.md` lists them all.
- `references/examples/template/<kind>/<variant>/`: complete, working v3 template questions grouped by input type, e.g. `references/examples/template/number-input/`.
- `references/examples/element/<name>/`: one demo question per element.
