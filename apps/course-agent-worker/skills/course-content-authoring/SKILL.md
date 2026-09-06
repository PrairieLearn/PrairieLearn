---
name: course-content-authoring
description: Create or edit PrairieLearn questions and assessments in the course agent's checked-out course, using local documentation and ready-to-adapt examples.
---

# PrairieLearn content authoring

For greetings or non-authoring questions, answer directly; do not inventory the repository.
For content requests, use the local references below instead of searching the web for basic formats.

## Start with the course

The working directory is the course checkout, normally `/workspace/course`. Read `infoCourse.json`
and list existing `courseInstances` and relevant `questions` directories once. Reuse the course's
topics, assessment sets, naming, and nearby examples. Do not scan the filesystem for skills.

Questions live in `questions/<qid>/info.json` and `question.html`; `server.py` is optional.
The metadata filename is **`info.json`, not `infoQuestion.json`**. Assessments live in
`courseInstances/<instance>/assessments/<assessment>/infoAssessment.json`. They reference QIDs
relative to `questions/`, without that prefix or a filename. Questions may use nested QIDs.
Creating question files alone does not add them to an assessment.

- For questions, read [question patterns](references/questions.md). Adapt the fixed-choice or
  randomized-number example under `assets/questions/`.
- For a basic Homework, use the example already supplied in the starting instructions; do not
  reread its file. For Exam-specific scoring or details not shown, read
  [assessment patterns](references/assessments.md) and the relevant example under `assets/assessments/`.
- For unfamiliar elements or advanced behavior, use the [documentation map](references/docs.md).
  Read only the relevant page or section, not all documentation.

These paths are relative to this skill's directory. They are reference material outside the
course checkout. Copy only requested content into the course, not the whole skill.

## Make a useful first version

For “make an assessment about dynamic programming,” make a modest, coherent set of questions
covering complementary skills: identifying a recurrence, tracing a table, or reasoning about
complexity. Prefer built-in graded elements over custom graders. Use the requested assessment type;
if unspecified, a practice `Homework` is a reasonable default. Use an existing instance when
unambiguous. If several are plausible, ask which one rather than creating a term or changing all.
Unless a question count is specified, start with three complementary questions; expand only if
the requested learning objectives need more. Preserve requested technical depth, including a
four-dimensional state space when requested, rather than simplifying the subject to save time.

Use a compact read → edit → review workflow. Batch the relevant reference and existing-file reads
into one command where practical. Make the related question and assessment edits together, then
review the changed files together. Do not reread unchanged files or browse additional examples
once you have enough information to implement the request. Revisit a file only to resolve a
specific uncertainty or check a subsequent edit; do not skip correctness checks just to save calls.

Generate fresh UUIDs for new questions and assessments, e.g. with Python's `uuid.uuid4()`.
Preserve UUIDs when editing existing content. Adapt example titles, QIDs, topics, and numbering.
Do not silently change release dates, access rules, sharing settings, or existing grading policies.
Leave a new assessment's release/access configuration for the instructor unless requested.
Do not add fictitious authors or enable public source sharing.

Once local examples answer the format question, implement the content. Use web search only for a
specific missing fact after checking the documentation map. Do not repeat searches for the same
schema or continue researching after the needed information is available. If an advanced feature
cannot be confirmed, use a supported simpler pattern or ask a focused question.

## Finish honestly

Review changed files, QID references, correct answers, and UUIDs. This version has no
`validate-course`, `question_render`, or `push_sync` tool. Do not invent or repeatedly search for
those commands. Editing files does not prove that PL rendered or graded them successfully.
Do not push. Report what you created in one to three sentences, including any unresolved choice
and that changes are local/not yet synced. Use inline code for file paths, not download links.
