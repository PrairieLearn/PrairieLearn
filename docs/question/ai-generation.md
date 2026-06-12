# AI question generation

AI question generation helps instructors create PrairieLearn questions from a natural language prompt. It can write the question prompt, choose supported PrairieLearn elements, generate `server.py` code when randomization or computed answers are needed, and revise the question based on follow-up instructions.

!!! warning "Alpha preview feature"

    AI question generation is currently an alpha preview. Generated questions can contain mistakes, ambiguous wording, incorrect assumptions, grading issues, or unsupported element usage. Always review the generated `question.html` and `server.py`, preview several variants, and test submissions before using the question in an assessment.

## Enabling AI question generation

While AI question generation is in development, it remains opt-in by course owners/editors. To enable it for a course:

1. Open the course as an instructor with editor permissions.
2. Go to **Course settings**.
3. Turn on **Enable AI question generation**.
4. Save the course settings.

After enabling the feature, go to the course **Questions** page and choose **Add questions** → **Generate question with AI**. If the question list is empty, the same action is available as **Generate with AI** in the empty-state controls.

## Creating a question

The AI question generator starts by creating a draft question. Draft questions are not ready to use in assessments until they are finalized.

1. Describe the question you want. Include the topic, what should be randomized, what students should enter, and any constraints on answer format or grading.
2. PrairieLearn opens the generated draft in an editor with a chat panel, preview, and file editors for `question.html` and `server.py`.
3. Review the preview and the generated files. Ask the AI to revise the draft or manually edit the files.
4. Generate new variants and submit test answers to check that rendering, randomization, parsing, grading, and feedback behave as expected.
5. Click **Finalize question**, then enter the title and QID that should be used in the question bank.

Finalizing makes the question available for normal use on assessments and redirects you to the regular question preview page.

## Supported question content

The generator can write ordinary HTML, LaTeX, supported PrairieLearn elements, and Python code in `server.py`. It can use `server.py` to generate random parameters in `data["params"]`, compute correct answers in `data["correct_answers"]`, and provide custom grading or feedback when appropriate.

Currently, AI question generation only supports a limited set of PrairieLearn elements.

Panel elements:

- [`pl-question-panel`](../elements/pl-question-panel.md)
- [`pl-submission-panel`](../elements/pl-submission-panel.md)
- [`pl-answer-panel`](../elements/pl-answer-panel.md)

Input elements:

- [`pl-checkbox`](../elements/pl-checkbox.md)
- [`pl-integer-input`](../elements/pl-integer-input.md)
- [`pl-multiple-choice`](../elements/pl-multiple-choice.md)
- [`pl-number-input`](../elements/pl-number-input.md)
- [`pl-string-input`](../elements/pl-string-input.md)
- [`pl-symbolic-input`](../elements/pl-symbolic-input.md)

## What is not supported

AI question generation is currently limited to a focused authoring workflow:

- It can only write `question.html` and `server.py`.
- It cannot configure JSON-only settings such as tags, topics, and question preferences.
- It cannot create or edit files outside the generated question's `question.html` and `server.py`, including images, datasets, `clientFilesQuestion/`, `serverFilesCourse/`, `tests/`, workspace files, external grader files, or other question-directory files.
- It cannot use PrairieLearn elements outside the supported list above.
- It cannot reliably build questions that depend on files it did not create. If a question needs an image, data file, starter code, workspace file, or external grader, add those files yourself and then edit the question manually.

Some unsupported tasks can still be done manually after finalizing the question. For example, you can use AI generation for a simple starting point, finalize the draft, and then add unsupported elements, extra files, JSON settings, external grading, or workspace configuration through the regular PrairieLearn authoring tools. These limitations will be lifted or reduced over time as AI question generation moves out of alpha preview.

## Prompting tips

Good prompts are specific about the educational goal and the expected student response. For example, say whether students should enter an integer, a decimal with units, a symbolic expression, free text, or select one or more options.

If the question should be randomized, describe the parameters and any ranges or constraints. If the answer needs special grading behavior, describe what should count as correct, what partial credit should be awarded, and what feedback students should receive.

When revising a draft, describe the desired outcome clearly, such as changing the randomization range, adding answer feedback, or making the wording more concise. After substantive revisions, preview and test the question again.
