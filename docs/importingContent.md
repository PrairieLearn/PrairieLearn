# Importing content from other platforms

If you're migrating from Canvas or another learning management system, you can import your existing quizzes and questions directly into PrairieLearn. The import tool reads standard QTI 1.2 exports — the same format that Canvas and many other platforms produce when you export quiz content.

!!! info

    This feature requires the `qti-content-import` feature flag to be enabled for your course. If you don't see the "Import content" button on your Assessments page, contact your PrairieLearn administrator.

## What you can import

The import tool supports both individual quiz exports (`.zip` files) and full course exports (`.imscc` files). It handles most standard question types:

| QTI question type             | PrairieLearn element                                              |
| ----------------------------- | ----------------------------------------------------------------- |
| Multiple choice               | [`pl-multiple-choice`](elements/pl-multiple-choice.md)            |
| True/false                    | [`pl-multiple-choice`](elements/pl-multiple-choice.md)            |
| Multiple answers (select all) | [`pl-checkbox`](elements/pl-checkbox.md)                          |
| Fill in the blank             | [`pl-string-input`](elements/pl-string-input.md)                  |
| Fill in multiple blanks       | [`pl-string-input`](elements/pl-string-input.md) (inline)         |
| Multiple dropdowns            | [`pl-dropdown`](elements/pl-dropdown.md) (inline)                 |
| Matching                      | [`pl-matching`](elements/pl-matching.md)                          |
| Numerical answer              | [`pl-number-input`](elements/pl-number-input.md)                  |
| Calculated / formula          | [`pl-number-input`](elements/pl-number-input.md) with `server.py` |
| Essay / free response         | [`pl-rich-text-editor`](elements/pl-rich-text-editor.md)          |
| File upload                   | [`pl-file-upload`](elements/pl-file-upload.md)                    |
| Ordering                      | [`pl-order-blocks`](elements/pl-order-blocks.md)                  |
| Text-only (no response)       | Prompt only                                                       |

Embedded images and other non-video media files referenced by questions are also imported.

## What isn't imported

- **Access rules** — Time limits, passwords, and start/end dates are not imported. These should be configured in PrairieLearn's [access control](assessment/accessControl.md) system.
- **Rubrics** — Rubric definitions are not imported from QTI exports.
- **Video files** — Video content (`.mp4`, `.webm`, `.mov`, etc.) is excluded from the import due to file size. The import review screen will list any skipped video files so you can re-host them separately.
- **Question banks / pools** — Canvas question banks are only included in full course exports (`.imscc`), not quiz-only exports, and won't be imported to PrairieLearn unless an imported quiz includes them.
- **Student data** — Submissions, grades, and enrollment data are not part of QTI exports.

The import review screen will tell you specifically what was and wasn't included for each upload.

## How to export from Canvas

1. In Canvas, go to **Settings** for your course.
2. Click **Export Course Content**.
3. Choose either:
   - **Quiz** — exports a single quiz as a `.zip` file
   - **Course** — exports everything as an `.imscc` file (this is the better option if you want to import multiple quizzes at once)
4. Download the export file when it's ready.

Other LMS platforms may have similar export features — look for "QTI export" or "IMS Common Cartridge export" in your platform's documentation.

## Importing into PrairieLearn

1. Navigate to your course instance's **Assessments** page.
2. Click the **Import content** button in the top-right corner.
3. Upload your `.zip` or `.imscc` file.
4. Review the import summary. You'll see:
   - How many assessments and questions were found
   - Any content that wasn't imported (rubrics, access rules, video files, etc.)
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
