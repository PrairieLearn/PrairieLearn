# `@prairielearn/question-conversion`

Internal package that converts questions from interchange formats into PrairieLearn course content. Today it supports **QTI 1.2** assessments (the format Canvas exports), producing PrairieLearn `question.html`, `info.json`, and `infoAssessment.json` files. The package is private — it ships as the `question-convert` CLI used by PrairieLearn maintainers and is not published to npm.

## CLI

The `question-convert` binary is exposed via `package.json#bin`. Build the package once (`yarn workspace @prairielearn/question-conversion build`), then run:

```text
question-convert <input> --course <dir> --course-instance <name> [flags]
```

| Flag                       | Required | Description                                                                                                                                                                 |
| -------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<input>`                  | yes      | Path to a QTI XML file, a quiz export directory, or a Canvas course-export directory containing `imsmanifest.xml`.                                                          |
| `--course <dir>`           | yes      | Target PrairieLearn course directory. New questions land in `<course>/questions/imported/<slug>/` and assessments in `<course>/courseInstances/<name>/assessments/<slug>/`. |
| `--course-instance <name>` | yes      | Course instance directory name (e.g. `Fall2025`).                                                                                                                           |
| `--timezone <tz>`          | no       | IANA timezone (e.g. `America/Denver`). Falls back to the course export's `course_settings.xml`, then to the existing `infoCourse.json`.                                     |
| `-t, --topic <topic>`      | no       | Default `topic` value written to each question's `info.json`.                                                                                                               |
| `--tags <tags...>`         | no       | Default tags for imported questions (default: `imported qti`).                                                                                                              |
| `--overwrite`              | no       | Delete the output directories before writing. Without this, conflicts cause the CLI to abort.                                                                               |

## Public API

For programmatic use, `@prairielearn/question-conversion` exports a small surface from `src/index.ts`:

- `convert`, `convertWith`, `parseAssessment` — high-level pipeline entry points.
- `QTI12AssessmentParser`, `InputParser`, `ParseOptions` — parser layer.
- `PLEmitter`, `BodyEmitRegistry`, `BodyEmitHandler`, `createPLBodyRegistry` — emitter layer.
- `TransformRegistry`, `TransformHandler`, `TransformResult`, `createQTI12Registry` — IR transform layer.
- IR and PL output types: `IRAssessment`, `IRQuestion`, `IRQuestionBody`, `PLQuestionInfoJson`, `PLAssessmentInfoJson`, etc.
- `detectCourseExport`, `findQtiFilesFromManifest`, `slugify` — Canvas course-export helpers.

The pipeline is `parse` (XML → IR) → `transform` (per-question normalization) → `emit` (IR → PrairieLearn files), with `bin/convert.ts` orchestrating the file-system side.

## Supported question types

| QTI 1.2 type                                      | PrairieLearn output                                                                 |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `multiple_choice_question`, `true_false_question` | `pl-multiple-choice`                                                                |
| `multiple_answers_question`                       | `pl-checkbox`                                                                       |
| `matching_question`                               | `pl-matching`                                                                       |
| `fill_in_multiple_blanks_question`                | inline `pl-string-input` blanks                                                     |
| `multiple_dropdowns_question`                     | inline `pl-dropdown` blanks                                                         |
| `short_answer_question`                           | `pl-string-input` / `pl-integer-input` / `pl-number-input` (chosen by answer shape) |
| `numerical_question`                              | `pl-number-input`                                                                   |
| `calculated_question`                             | `pl-number-input` with a generated `server.py`                                      |
| `essay_question`                                  | `pl-rich-text-editor` (manually graded)                                             |
| `file_upload_question`                            | `pl-file-upload` (manually graded)                                                  |
| `text_only_question`                              | prompt-only panel (manually graded)                                                 |

When a question lacks data needed to auto-grade (e.g. no `<respcondition>` marks any choice correct), it is still emitted but flagged `gradingMethod: 'Manual'` with a warning so the conversion completes and a TA can grade it by hand. Structural failures (missing `<formula>` or zero `<var>`s in a calculated question, missing `<questestinterop>` root) raise an error.

## Limitations

- **QTI 2.1 is not supported.** Earlier drafts targeted both 1.2 and 2.1; 2.1 was removed because Canvas (the primary target) only emits 1.2. New formats can be added by registering an `InputParser` plus a `TransformRegistry`.
- The CLI assumes input is trusted (course content from the instructor). The same instructor could author arbitrary Python in `server.py` directly, so the generated `server.py` is not sandboxed or validated. Output paths, however, are constrained to the target course directory so a malformed QTI can't write outside it.
