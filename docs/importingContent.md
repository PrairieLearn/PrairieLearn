# Importing content from other platforms

If you're migrating from Canvas or another learning management system, you can import existing quizzes, assessments, question banks, and questions into PrairieLearn. The import tool reads QTI 1.2 content, which is the format Canvas exports for quiz and course content.

!!! info

    This feature requires the `qti-content-import` feature flag to be enabled for your course. If you don't see import options on the Assessments or Questions pages, contact your PrairieLearn administrator.

## Overview

The importer is a review-and-confirm workflow:

1. Export quiz or course content from Canvas or another LMS.
2. Upload the exported `.zip` or `.imscc` file to PrairieLearn.
3. If the upload references question banks that were not included in the file, PrairieLearn asks for supplemental exports that contain those banks. You can also continue without the missing bank content.
4. Review what PrairieLearn found. The review page separates **Assessments** from **Question banks**:
   - Assessments are imported to PrairieLearn with their questions and basic quiz structure. After import, you can edit their settings, adjust question order and points, and assign them like any other assessment.
   - Question banks are imported as a set of PrairieLearn questions in your course. You can add them to existing assessments or use them in any new assessments you create.
5. Optionally edit assessment settings and question metadata before importing.
6. Confirm the import. PrairieLearn writes the files to your course repository and syncs them automatically.

## Where to start an import

You can start the QTI importer from either of these pages:

- On a course instance **Assessments** page, click **Import content**.
- On the **Questions** page, open the **Add questions** dropdown and click **Import questions**.

Both entry points use the same importer. If you start from the Questions page, PrairieLearn returns you to the Questions page after the import completes. Otherwise, it returns you to the Assessments page.

## What you can import

The import tool supports individual quiz exports (`.zip` files) and full course exports (`.imscc` files). It handles the following QTI 1.2 question types:

| QTI question type             | PrairieLearn output                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| Multiple choice               | [`pl-multiple-choice`](elements/pl-multiple-choice.md)                                  |
| True/false                    | [`pl-multiple-choice`](elements/pl-multiple-choice.md)                                  |
| Multiple answers (select all) | [`pl-checkbox`](elements/pl-checkbox.md)                                                |
| Fill in the blank             | [`pl-string-input`](elements/pl-string-input.md)                                        |
| Fill in multiple blanks       | Inline [`pl-string-input`](elements/pl-string-input.md) blanks                          |
| Multiple dropdowns            | Inline [`pl-multiple-choice`](elements/pl-multiple-choice.md) with `display="dropdown"` |
| Matching                      | [`pl-matching`](elements/pl-matching.md)                                                |
| Numerical answer              | [`pl-number-input`](elements/pl-number-input.md)                                        |
| Short answer                  | `pl-string-input`, `pl-integer-input`, or `pl-number-input`                             |
| Calculated / formula          | [`pl-number-input`](elements/pl-number-input.md) with `server.py`                       |
| Essay / free response         | [`pl-rich-text-editor`](elements/pl-rich-text-editor.md)                                |
| File upload                   | [`pl-file-upload`](elements/pl-file-upload.md)                                          |
| Ordering                      | [`pl-order-blocks`](elements/pl-order-blocks.md)                                        |
| Text-only (no response)       | Prompt-only question panel                                                              |

Referenced images and other non-video media files are imported into each question's `clientFilesQuestion` directory. If a question references a remote image URL instead of an exported file, PrairieLearn leaves that URL in the generated HTML and shows a warning so you can decide whether to keep or replace it after import.

## What isn't imported

- **Access rules**: Time limits, passwords, and start/end dates are stripped during import. Configure these after import with PrairieLearn's [access control](assessment/accessControl.md) system.
- **Rubrics**: Rubric definitions are not imported from QTI exports.
- **Video files**: Video content (`.mp4`, `.webm`, `.mov`, etc.) is excluded due to file size. The review page lists skipped video files on the affected questions so you can re-host or replace them separately.
- **Missing question bank content**: Your exports may reference question banks without including the actual bank questions. PrairieLearn can only import those questions if you provide an export that contains the matching bank content, or if the original upload already includes it.
- **Student data**: Submissions, grades, and enrollment data are not part of QTI exports and are not imported.

The review page summarizes what can be imported and what known content was skipped or stripped.

## Canvas question banks

Canvas exports can represent question banks in several ways:

- A full course export may include the question bank content directly. PrairieLearn imports those banks as standalone PrairieLearn questions and can attach matching bank questions to assessments that reference them.
- A quiz export may only contain a reference to a question bank. When that happens, PrairieLearn pauses on a **Some questions are in question banks** step and asks you to upload supplemental exported content for each missing bank.
- If Canvas identifies the source course for a missing bank, PrairieLearn shows the Canvas course ID to help you find the right course export. You can find that ID in Canvas URLs such as `/courses/12345`.
- If you upload supplemental content that does not contain the referenced bank, PrairieLearn shows an alert and lets you try another file.
- If you continue without additional content, the unresolved bank questions are omitted from the imported assessment. PrairieLearn shows a warning on the review page for any bank references that remain unresolved.

When multiple assessments use the same imported bank questions, PrairieLearn points them at the same imported question directories instead of creating duplicate copies.

If the same generated question appears in more than one imported question bank, PrairieLearn imports one copy and shows an informational note above the **Question banks** section with the number of deduplicated questions.

## Duplicate questions

PrairieLearn deduplicates identical generated questions during the import. If two source questions produce the same title, generated question markup, grading code, grading metadata, skipped video list, and client file contents, PrairieLearn imports one copy and rewrites assessments to reference that shared question.

This is intended for cases where Canvas exports copied questions or repeated question bank content. Questions that differ in generated content are imported separately.

## How to export from Canvas

1. In Canvas, go to **Settings** for your course.
2. Click **Export Course Content**.
3. Choose either:
   - **Quiz**: exports a single quiz as a `.zip` file.
   - **Course**: exports the course as an `.imscc` file. Use this when importing multiple quizzes, question banks, or quizzes that depend on question banks.
4. Download the export file when it's ready.

Other LMS platforms may have similar export features. Look for "QTI export" or "IMS Common Cartridge export" in your platform's documentation.

## Importing into PrairieLearn

1. Open the importer from the Assessments or Questions page.
2. Upload a `.zip` quiz export or `.imscc` course export.
3. If PrairieLearn asks for supplemental question bank content, upload the requested course export files or click **Continue without additional content**.
4. Review the import summary. It may include:
   - The number of assessments, question banks, questions, and referenced assets that can be imported.
   - Access rules, rubrics, videos, unsupported content, or parse warnings that will not be imported.
   - Warnings for unresolved question bank references or remote image URLs, plus an informational note for question bank questions that were deduplicated.
   - Warnings for repeated question names that should be renamed before import.
5. In the **Assessments** section, choose which assessments to import. For each assessment, you can edit the **title**, **type** (Homework or Exam), **set**, and **number**.
6. In the **Question banks** section, choose which question banks to import as standalone PrairieLearn questions.
7. Expand the **Questions** section on any assessment or question bank to review individual questions. For each question, you can:
   - Edit the **title**, **topic**, and **tags**.
   - Browse the generated files, including `info.json`, `question.html`, `server.py`, and referenced assets.
   - View syntax-highlighted file contents.
   - Review any warnings associated with that specific question.
   - Exclude the question from the import.
8. If an imported question conflicts with an existing question directory, choose **Replace existing question** or **Keep both**. You can also apply overwrite/rename choices to all conflicts in a section.
9. Click the final **Import** button to create the selected content.

Imported questions are written under `questions/imported/`. Imported assessments are written under the current course instance's `assessments/` directory. After import, you can edit the generated content like any other PrairieLearn question or assessment.

## Tips

- **Use a full Canvas course export for question banks.** Quiz exports often contain only references to banks, not the bank questions themselves.
- **Start with a single quiz** to get a feel for the import process before importing a large course export.
- **Review the generated markup**. The converter does its best to produce clean PrairieLearn HTML, but you may want to adjust formatting, grading behavior, or randomized parameters after import.
- **Imported questions are tagged** with `imported` by default, making them easy to find and filter in the Questions list.
- **Manually graded source questions** such as essays and file uploads are marked for manual grading in PrairieLearn.
