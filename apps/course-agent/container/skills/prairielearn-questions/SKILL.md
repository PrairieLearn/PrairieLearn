---
name: prairielearn-questions
description: Write, edit, review, or debug PrairieLearn questions (questions/<qid>/ with info.json, question.html, server.py and pl-* elements such as pl-number-input or pl-multiple-choice). Use for any task that creates or changes a question.
---

# PrairieLearn questions

The staff request decides what the question asks. The course's existing questions decide how it looks. The rules below hold regardless of either, except where a rule says otherwise.

## Workflow

1. To change an existing question, read "Editing existing questions" first.
2. For a new question, read the two or three existing questions most like the request (same topic, assessment, or input type). Staff expect new questions to look like these. If they share a layout, start from a copy of the closest one and adapt it, keeping its structure, wording style, labels and units, worked-solution format, QID and `answers-name` naming, `info.json` topics and tags, helpers and `clientFiles`, and grading tolerances. If the course has no similar questions, write a plain question.
3. Look up each element you use in PrairieLearn's documentation at docs.prairielearn.com.
4. Write the question following the rules below.
5. Before requesting review, check the files against this list, even where the course's existing questions differ:
   - every input element is outside all panels;
   - TeX in attributes uses single backslashes;
   - no Mustache tag sits directly inside TeX braces;
   - `correct_answers` is set only for elements that read it;
   - no key that `server.py` sets in `data["params"]` has the same name as any `answers-name` in `question.html`;
   - the grading tolerance accepts an answer computed from the displayed values and rounded sensibly;
   - nothing gives away the answer or how to get it, unless the request asks for that.
6. In your summary, name each course pattern you deliberately didn't follow and why, for example "the existing questions put the input inside the question panel, which hides the correct answer after grading, so this one puts it outside". Offer to fix the pattern in other questions instead of fixing it unasked.

## Rules

- **Files.** Each question lives in its own directory under `questions/` (`questions/<qid>/` with `info.json`, `question.html`, and optionally `server.py`). `info.json` needs `"uuid"`, `"title"`, `"topic"`, and `"type": "v3"`.
- **Panels.** Input elements (`pl-number-input`, `pl-multiple-choice`, `pl-checkbox`, …) must not be placed inside `pl-question-panel`, `pl-answer-panel`, or `pl-submission-panel`; they render their own question, submission, and answer views. Put the question text inside one `pl-question-panel`, since text outside every panel is repeated in the answer and submission views.
- **Correct answers.** `generate(data)` in `server.py` puts random values in `data["params"]`. Set `data["correct_answers"][answers-name]` only for elements that read it, such as `pl-number-input`; check each element's documentation. Elements that set their own answer, such as `pl-multiple-choice` and `pl-checkbox` (through `correct="true"` on their options), make every variant fail if you set `correct_answers` for them. They also store their options under `data["params"][answers-name]`, so never use their `answers-name` as a params key.
- **Numbers.** Mustache only substitutes values, so do anything that depends on them in `server.py`: computing, rounding, formatting numbers, and choosing how an expression is written (signs, coefficients of 1, so students see `3x - 2` rather than `3x + -2` or `1x`). Never show Python e-notation such as `1.2e-05`; write `1.2 \times 10^{-5}`. Show given values with the precision used to compute the answer, and choose a tolerance that accepts a sensibly rounded answer.
- **Math.** Write math as MathJax: inline `$...$` or `\(...\)`, display `$$...$$` or `\[...\]`. A literal dollar sign, such as a price, starts math mode; write it as `<span class="mathjax_ignore">$</span>`. Never put a Mustache tag directly inside TeX braces, as in `\frac{{params.a}}{{params.b}}`; write `\frac{ {{params.a}} }{ {{params.b}} }` or build the expression in `server.py`. In HTML attributes, use single backslashes (`suffix="$\mathrm{m/s}$"`): a doubled backslash is a TeX line break, so `$\\text{MPa}$` renders as "textMPa".
- **Escaping.** Mustache HTML-escapes `{{...}}`; triple braces (`{{{...}}}`) insert raw HTML. Use triple braces only for HTML you build in `server.py`, never for anything students control, such as `submitted_answers` or `raw_submitted_answers`. To show student-provided HTML, use `pl-xss-safe`.
- **Content.** Present given values as facts without mentioning randomization. Give students the model, relationships, and constants they need, but don't explain how to solve it or hint at the answer (including how many options are correct) unless staff ask. A formula in the request that defines the correct answer is for computing it in `server.py`; show it only if the request says to. Unless the course's questions do otherwise, put a worked solution in `pl-answer-panel`.

## Editing existing questions

Read the question's current files first and change only what the request needs. Apply the step 5 checklist to what you add or change; if the rest of the question fails it, say so and offer to fix it.

Each student variant keeps the `params` and `correct_answers` that `generate()` produced when it was created, and submissions are stored under each input's `answers-name`. Everything else (`question.html`, element attributes, `grade()`, `parse()`) is read from the current files and runs against those saved values, so an edit can break variants students already have.

To tell whether students could have variants, search for the QID in `courseInstances/*/assessments/**/infoAssessment.json` (questions are listed by `"id"`, including inside `alternatives`), and check `info.json` for `sharePublicly` or `sharingSets`, which let other courses use it. If you created the question in this conversation, or nothing lists or shares it, change anything freely. Otherwise assume students may have started it unless staff say otherwise; you can't see variants or submissions. Tell staff which assessments use it, and:

- Keep the QID, `uuid`, and every `answers-name`. Renaming an `answers-name` makes existing variants grade correct answers as wrong, with no error.
- Don't rename or remove `params` or `correct_answers` keys. Existing variants won't have a key you add: read it with `data["params"].get(key, default)` in `grade()`, `parse()`, and other code that runs on them, and show it in `question.html` only inside a Mustache section (`{{#params.key}}…{{/params.key}}`) so old variants omit it instead of showing a blank.
- Tell staff who a change reaches. Anything decided when a variant is created reaches only new variants: `generate()` and the correct answers it sets, and whatever elements save then, such as the options a `pl-multiple-choice` shows and their order. Element attributes read when grading, such as tolerances, apply to existing variants on their next submission.
- If a change can't be made compatibly, say so and suggest creating a new question (new directory and `uuid`) instead, or, for Homework assessments, having staff reset the question's variants, which discards unsubmitted work. Exam variants can't be reset.
