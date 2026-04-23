# Importing content from other platforms

If you're migrating from Canvas or another learning management system, you can import your existing quizzes and questions directly into PrairieLearn. The import tool reads standard QTI 1.2 exports — the same format that Canvas and many other platforms produce when you export quiz content.

!!! info

    This feature requires the `qti-content-import` feature flag to be enabled for your course. If you don't see the "Import content" button on your Assessments page, contact your PrairieLearn administrator.

## What you can import

The import tool supports both individual quiz exports (`.zip` files) and full course exports (`.imscc` files). It handles most standard question types:

| QTI question type             | PrairieLearn element               |
| ----------------------------- | ---------------------------------- |
| Multiple choice               | `pl-multiple-choice`               |
| True/false                    | `pl-multiple-choice`               |
| Multiple answers (select all) | `pl-checkbox`                      |
| Fill in the blank             | `pl-string-input`                  |
| Fill in multiple blanks       | `pl-string-input` (inline)         |
| Multiple dropdowns            | `pl-dropdown` (inline)             |
| Matching                      | `pl-matching`                      |
| Numerical answer              | `pl-number-input`                  |
| Calculated / formula          | `pl-number-input` with `server.py` |
| Essay / free response         | `pl-rich-text-editor`              |
| File upload                   | `pl-file-upload`                   |
| Ordering                      | `pl-order-blocks`                  |
| Text-only (no response)       | Prompt only                        |

Embedded images and other media files referenced by questions are also imported.

## What isn't imported

Some content doesn't carry over from QTI exports, either because the format doesn't include it or because it's better configured anew in PrairieLearn:

- **Access rules** — Time limits, passwords, and start/end dates are not imported. These should be configured in PrairieLearn's [access control](assessment/accessControl.md) system.
- **Rubrics** — QTI quiz-only exports don't include rubric definitions. Even in full course exports, rubric data isn't carried into PrairieLearn.
- **Question banks / pools** — In quiz-only exports, Canvas question banks referenced by a quiz are not included. Only questions that appear directly in the quiz are exported. Full course exports (`.imscc`) may include question bank content.
- **Student data** — Submissions, grades, and enrollment data are not part of QTI exports.

The import review screen will tell you specifically what was and wasn't included for each upload.

## How to export from Canvas

1. In Canvas, go to **Settings** for your course.
2. Click **Export Course Content**.
3. Choose either:
   - **Quiz** — exports a single quiz as a `.zip` file
   - **Course** — exports everything as an `.imscc` file (this is the better option if you want to import multiple quizzes at once)
4. Download the export file when it's ready.

Other LMS platforms have similar export features — look for "QTI export" or "IMS Common Cartridge export" in your platform's documentation.

## Importing into PrairieLearn

1. Navigate to your course instance's **Assessments** page.
2. Click the **Import content** button in the top-right corner.
3. Upload your `.zip` or `.imscc` file.
4. Review the import summary. You'll see:
   - How many assessments and questions were found
   - Any content that wasn't imported (rubrics, access rules, etc.)
5. For each assessment, you can edit the **title**, **type** (Homework or Exam), **set**, and **number** before creating it.
6. Expand the **Questions** section on any assessment to review individual questions. For each question, you can:
   - Edit the **title**, **topic**, and **tags**
   - Browse the generated files (question markup, `info.json`, `server.py`, images) in the file tree
   - View syntax-highlighted previews of each file
   - Exclude specific questions from the import using the checkbox
7. If any questions conflict with existing questions in your course (for example, if you're re-importing), you'll see a warning with options to either **overwrite** the existing question or **create a copy** with a different name.
8. Click **Create** to finalize the import. The questions and assessments will be written to your course and synced automatically.

After import, you'll find your new assessments on the Assessments page and the imported questions under `questions/imported/` in your course files. From there, you can edit them just like any other PrairieLearn content — adjust grading settings, add randomization with `server.py`, refine the HTML, or reorganize the file structure.

## Tips

- **Start with a single quiz** to get a feel for the import process before importing a full course export.
- **Review the generated markup** — the converter does its best to produce clean PrairieLearn HTML, but you may want to adjust formatting or add features that weren't part of the original quiz (like randomized parameters).
- **Imported questions are tagged** with `imported` by default, making them easy to find and filter in the Questions list.
- **Question types that require manual grading** (essays, file uploads) are automatically marked with `gradingMethod: "Manual"` so they'll appear in the manual grading queue.
