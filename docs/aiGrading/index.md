# AI Grading

## What is AI grading

AI grading is a fully automated grading workflow. Give it a rubric and a set of submissions, and an LLM grades them end-to-end — selecting rubric items, writing a rationale, and recording scores through PrairieLearn's [manual grading web interface](../manualGrading/index.md#manual-grading-using-the-web-user-interface). It runs on any question with `manualPoints` and a rubric, launches from the **Manual Grading** tab, and every result remains open to human override.

## What you can use AI grading for

AI grading works on any [manually-graded question](../manualGrading/index.md#manual-grading-using-the-web-user-interface). Supported submission types:

- **Text input.** Short answers, written reasoning, and essays via `pl-string-input` or `pl-rich-text-editor`.
- **Code.** Source files via `pl-file-editor` or `pl-file-upload`, typically graded for approach, style, or "show your work" alongside auto-grading.
- **Captured images.** Handwritten math, diagrams, and scratch work via [`pl-image-capture`](../elements/pl-image-capture.md) or image files uploaded through [`pl-file-upload`](../elements/pl-file-upload.md).

Common use cases include handwritten problem sets, code-style feedback, short free-response explanations, and "show your work" portions of auto-graded questions.

Accuracy depends heavily on having a well-structured rubric — the model uses rubric items as both the scoring scale and the structure of its rationale. See [Creating a rubric for manual grading](../manualGrading/index.md#creating-a-rubric-for-manual-grading).

## Writing rubrics for AI grading

The rubric is your main lever for tuning AI grading. The model reads these fields on every submission; use them deliberately to handle edge cases:

- **Item description.** Student-visible summary. Keep it precise — the model treats it as the item's definition.
- **Item explanation.** Student-visible context that disambiguates similar items.
- **Item grader note.** Staff-only instructions on when to select or skip the item. The best place for directives you don't want students to see — e.g. "select only if the student shows the derivation, not just the final answer."
- **Rubric-level grader guidelines.** Overarching policies across items — e.g. "ignore minor notation differences" or "don't penalize missing units on intermediate steps."

When the AI grades something incorrectly, the fix is almost always a sharper grader note or guideline, not a PrairieLearn setting.

## Setting up AI grading

Prerequisites:

- The question has `manualPoints` set in its [assessment configuration](../assessment/configuration.md#question-specification).
- A [rubric](../manualGrading/index.md#creating-a-rubric-for-manual-grading) has been created.

Steps:

1.  Open the **Manual Grading** tab and click into the question.

    [Screenshot: Manual Grading tab listing questions]

2.  Turn on the **AI grading mode** toggle in the action bar at the top of the grading page.

    [Screenshot: AI grading mode toggle in the on position]

3.  Set up billing for the course instance. Only **course owners** can do this. Choose **one**:
    - **PrairieLearn-managed credits.** Open **Instance Admin → AI Grading**, click **Purchase credits**, pick a package ($10, $25, or $100) or enter a custom amount, and complete Stripe checkout.

      [Screenshot: Purchase credits modal]

    - **Custom API keys.** Open **Instance Admin → AI Grading**, click **Add API key**, choose a provider, and paste the key:

      | Provider      | Key type                   | Key prefix | Where to get one                                                                   |
      | ------------- | -------------------------- | ---------- | ---------------------------------------------------------------------------------- |
      | **OpenAI**    | Standard API key           | `sk-...`   | [platform.openai.com/api-keys](https://platform.openai.com/api-keys)               |
      | **Anthropic** | Standard API key           | `sk-ant-…` | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
      | **Google**    | Gemini API key (AI Studio) | `AIza…`    | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)           |

      Keys are encrypted at rest and used only for AI grading on this course instance. Add only the provider(s) whose models you plan to use.

      [Screenshot: Add API key modal]

4.  Use **Grade with AI** on the question's grading page to run a pass over all submissions or a selected subset.

    [Screenshot: Grade with AI action]

## How billing works

PrairieLearn offers two billing modes, both configured **per course instance** — credits and API keys don't carry over between course instances, and only **course owners** can change them.

### PrairieLearn-managed credits

Buy credits via Stripe on the **AI Grading** admin page. PrairieLearn calls the provider on your behalf and deducts cost from your pool.

- **Packages**: $10 (testing), $25 (small courses), $100 (large courses).
- **Minimum** $10, **maximum** $10,000.
- **Infrastructure fee**: 20% markup on top of raw provider cost.
- **Approximate cost**: ~$0.03 per submission, depending on model, submission format, and question content (see [What affects cost](#what-affects-cost)).

#### Rate limits

PL-managed usage is capped at **$10 of AI grading spend per course instance per hour** by default. When the cap is hit, in-flight calls finish and remaining submissions in the batch are skipped with `"You've reached the hourly usage cap for AI grading. Please try again later."` Re-run the pass after the hour rolls over. Custom API keys are not rate-limited by PrairieLearn — the provider's own limits apply.

#### When credits run out

If a batch starts with credits and the pool is exhausted mid-run, in-flight calls still complete and are deducted, while remaining submissions are skipped with `"No credits remaining."` Balances are **clamped at $0 and never go negative** — if a completed call would cost more than the remaining balance, the deduction is capped at whatever's left, so you can't be overcharged. To grade the skipped submissions, purchase more credits on the **AI Grading** admin page and re-run the pass.

### Custom API keys

Bring your own OpenAI, Anthropic, or Google key on the **AI Grading** admin page. PrairieLearn calls the provider with your key; **the provider bills you directly** — no markup, no PrairieLearn rate limit. Token usage is still recorded on course usage dashboards.

### What affects cost

Cost is token-based under both modes. The main drivers:

- **Model.** Per-token rates vary widely. Supported models:
  - **OpenAI**: GPT 5-mini, GPT 5.1
  - **Anthropic**: Claude Haiku 4.5, Sonnet 4.5, Opus 4.5
  - **Google**: Gemini 3.1 Pro, Gemini 2.5 Flash, Gemini 3 Flash

  The default is `gpt-5-mini-2025-08-07`. Smaller models (GPT 5-mini, Gemini Flash, Claude Haiku) cost substantially less than frontier models (GPT 5.1, Claude Opus 4.5, Gemini 3.1 Pro).

- **Submission format.** Image submissions cost significantly more than text, because images consume many input tokens.
- **Question content size.** The prompt includes the question HTML, the full rubric (descriptions, explanations, grader notes), the correct answer, and any auto-grading partial scores. Larger questions and rubrics mean larger prompts.
- **Reasoning tokens.** Reasoning-capable models (GPT 5.1, Claude Opus 4.5) bill for invisible reasoning tokens on top of output.
- **Cached input.** Provider prompt caching discounts the shared question/rubric portion of the prompt, so per-submission cost usually drops across a run.

Under **PL-managed billing**, the per-call charge is `(Σ tokens × per-model rate) × 1.20`, deducted in milli-dollars from your credit pool. Under **custom API keys**, the raw provider charge bills directly; PrairieLearn records the same token totals for transparency.

## How AI grading processes a submission

- **Inputs.** For each submission, PrairieLearn builds a prompt from the question, the submission, the rubric, the correct answer, any auto-grading partial scores, and grader notes.
- **Concurrency.** Up to 20 submissions are graded in parallel, so a full assessment finishes in minutes.
- **Image rotation correction** _(Gemini models)._ PrairieLearn detects handwriting orientation and rotates the image before sending it to the model, which significantly improves OCR accuracy on phone photos taken at an angle.

## Reviewing AI grading output

After a run, the AI fills in the standard manual-grading panel with its rubric selections and score, just like a human grader. Two diagnostic outputs are visible on the grading page alongside the normal controls:

- **Explanation.** The model's rationale for each rubric item. Use it to spot-check reasoning. If the explanation disagrees with your judgment, the right fix is usually a sharper grader note or guideline.
- **Transcription** _(image submissions only)._ The model's interpretation of the handwriting or drawing, written out before grading. Transcription errors are the dominant source of mistakes on image submissions — if the transcription is wrong, the grading is usually wrong too. Scanning it is the fastest way to catch OCR failures.

Override the AI's decision from the same grading page by changing the rubric items or adjusting the score directly.

## Comparing AI and human grading

When both a human grader and the AI have graded the same submission, the question's manual-grading page adds an **AI agreement** column to the submission list:

- A green checkmark means the AI and the human selected the exact same rubric items.
- `+N` or `-N` points (in red) means the AI's score differed from the human's by that many points.
- Each per-item disagreement is listed inline — a plus icon for rubric items the AI selected but the human didn't (false positive), a minus icon for items the human selected but the AI didn't (false negative).

Use the **Export AI grading statistics** button on the same page to download an assessment-wide report with per-rubric-item confusion matrices (TP / TN / FP / FN) along with accuracy, precision, recall, and F1. This is useful for evaluating AI grading on a pilot batch before running it at scale, or for auditing the AI's decisions against a human-graded sample.
