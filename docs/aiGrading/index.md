# AI grading

## Overview

AI grading uses large language models to grade manual questions in PrairieLearn. It applies your rubric to submissions, produces scores, and generates explanations instructors can review, adjust, or override.

*[image]*

## Use cases

AI grading works on any manually graded question.

**Supported elements:**

- `pl-image-capture`
- `pl-rich-text-editor`
- `pl-file-upload`
- `pl-file-editor`
- `pl-string-input`

**Common use cases:**

- Essay and free-response questions
- Mathematical proofs and derivations
- Diagrams and handwritten work
- Code explanations and written reasoning
- Short-answer justifications

## Prerequisites

Before you can use AI grading, you'll need:

- A course instance
- A manually graded question with at least one submission
- A rubric (strongly recommended — see Best practices)
- Course owner permissions, required to purchase credits
- Billing configured for your course instance (see Billing)

## Setup

1. **Navigate to manual grading** for your assessment question.

    *[Screenshot: Manual grading page.]*

2. **Open the "AI grading" dropdown.**

    *[Screenshot: Manual grading page with the AI grading dropdown open, showing available actions.]*

3. **Select a model.** Use PrairieLearn's recommended model for your question type.

    *[Screenshot: Model selection options.]*

4. **Grade submissions.** We recommend testing on a small batch (5–10 submissions), reviewing the output, and refining your rubric before running on the full set.

## Best practices

- **Use PrairieLearn's recommended model.** Model choice can significantly impact grading accuracy, particularly for image submissions — Gemini currently outperforms GPT and Claude at transcription.
- **Use rubrics over point-based grading.** Rubrics give the model clear, discrete criteria, which significantly improves consistency.
- **Write well-specified rubric items.** Each item should describe exactly what earns or loses credit. Ambiguous items produce ambiguous grades.
- **Use grader guidelines.** This field is for instructions the model should follow but that shouldn't appear in the student-facing rubric — e.g., "accept equivalent algebraic forms" or "do not penalize minor notation differences."
- **Iterate.** If you see systematic errors in the first batch, refine the rubric rather than overriding grades one by one.

## Reviewing AI grades

For each submission, AI grading produces:

- **Explanation** — the model's reasoning for the grade it assigned, item by item.
- **Transcription** *(image submissions only)* — the model's text rendering of what it saw in the image, useful for catching misreads.

    *[Screenshot: Transcription view.]*

- **AI agreement indicator** — when a submission has also been human-graded, shows whether the AI grade matches.

    *[Screenshot: AI agreement indicator.]*

Instructors can accept, adjust, or fully override any AI grade.

*[Screenshot: Instructor override interface.]*

## The grading process

AI grading assembles a prompt from the following inputs and sends it to the selected model.

**Inputs sent to the model:**

- Tuned grader prompt (maintained by PrairieLearn)
- Question prompt
- Correct answer
- Rubric
- Student submission

**Outputs returned:**

- Graded rubric (item-by-item scoring)
- Explanation
- Transcription *(image submissions only)*

**Concurrency.** AI grading keeps up to 20 submissions in progress at any time. When one finishes, the next begins automatically.

**Privacy.** Student identifying information (name, email, UIN) is not sent to LLM providers, as long as it is not embedded in the submission itself or in the question or correct answer.

## Billing

AI grading requires either PrairieLearn-managed credits or a custom API key. Billing is configured once per course instance.

### Billing modes

- **PrairieLearn-managed credits** — simpler setup, no provider account needed. You purchase credits through PrairieLearn and pay a 20% infrastructure fee on top of provider costs.
- **Custom API key** — bring your own provider key (OpenAI, Anthropic, Google). You're billed directly by the provider and PrairieLearn charges no infrastructure fee.

### Credit types

- **Transferable credits** can be moved between course instances.
- **Non-transferable credits** are locked to the instance they were added to.

### Billing configuration

1. Go to **Settings → Billing** in your course instance.
2. Either purchase credits or add a custom API key.

*[Screenshot: Billing page, showing the "Purchase credits" and "Custom API key" options.]*

## Cost and runtime

### Factors affecting cost and runtime

| Factor | Increases cost | Decreases cost |
|---|---|---|
| Model | Larger, reasoning models | Smaller, non-reasoning models |
| Submission type | Image submissions | Text submissions |
| Question content size | Longer prompts and reference answers | Shorter prompts and reference answers |
| Cached input | — | Repeated content across submissions (e.g., question text, rubric) |

PrairieLearn-managed keys carry a 20% infrastructure fee on top of provider costs.

### Benchmarks

Costs vary course-to-course depending on rubric length, submission length, and model choice. The numbers below are representative, not guarantees.

*Benchmarks below were run using PrairieLearn-managed keys and include the 20% infrastructure fee.*

**Free-response question, text grading (200 submissions):**

- *[$xx.xx — add benchmark]*
- *[$xx.xx — add benchmark]*

**Proof question, image grading (~241 submissions):**

| Model | Cost / submission | Time / submission |
|---|---|---|
| GPT-5.4 mini | $0.0067 | 2.9s |
| GPT-5.4 | $0.0159 | 1.4s |
| Gemini 3.1 Pro | $0.0504 | 1.5s |

*Per-submission times are measured with many submissions in flight — a single submission graded on its own will take longer.*

*[Verify model names before publishing.]*