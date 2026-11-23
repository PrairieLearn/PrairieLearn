# Printing assessments

Course editors can print an assessment for students to complete on paper. Choose the questions to include, leave room for written work, and preview student copies and answer keys before downloading a PDF or an editable Word file. Other course staff with preview access can view existing forms and previews, but cannot change forms or start a download. If you do not see **Print** on the assessment's **Questions** page, printing may not be available for your course yet.

For assessments with randomization, you can print multiple _forms_, such as A1 and B1. Each form keeps its selected questions, their order and any random values, and its print settings. Forms are shared with all course staff who have preview access. Creating or regenerating a form does not start or change a student attempt. Printing is not currently available for group assessments.

## Print an assessment

1. Open the assessment's **Questions** page and select **Print**. If the assessment has questions, Form A1 is created automatically the first time a course editor opens this view. Its questions and any random values are chosen then; you can leave questions out before downloading.
2. Under **Paper and layout**, choose a **Paper size** for all current forms and **Space per question** for the selected form.
3. Choose what to include on the [cover page](#cover-pages).
4. Under **Questions in this form**, uncheck any questions you want to leave out. Use **Spacing** to give individual questions more or less room.
5. Most settings save as you change them. Select **Save** after editing **Additional student fields**. Then select **Update preview** to see your changes without changing the form's randomization. Check the **Student copy** and **Answer key** above the preview.
6. When you are satisfied with the preview, open **Download…** and [choose a file](#download-files). Starting the first download fixes which questions the form includes, so check the preview first.

The spacing you choose is a minimum. Longer questions can take more space and move to the next page when needed. Check that students have enough room to write their answers.

## Review questions

Review every question in the preview, including its instructions, figures, and answer choices. Questions that work well online may need changes for a paper assessment. Expandable sections print in full, even when they are closed in the online question.

If your course uses custom elements in questions, check those questions in both the preview and downloaded files. Some elements designed for the screen may not print as expected. Custom elements and question scripts that render asynchronously, for example by loading a library or drawing to a canvas after the page loads, must [report when they finish rendering](../devElements.md#elements-that-render-asynchronously). Otherwise, they may print incomplete.

The question list highlights two kinds of items to check:

- **Review printability** suggests that a question may need adjustments for paper. These suggestions do not prevent you from downloading the assessment.
- **Omitted** means a question could not be included, for example because it has an error, because an image or element in it did not finish loading, or because it uses an image from another website. Images must be stored in your course to print. Use **Edit question** to fix it, or uncheck it to leave it out of a current form, then select **Update preview**. Downloads are unavailable while included questions have these errors. If a download has started for the form, changing a checkbox asks you to create a new numbered version. Previous forms cannot be edited, so reload the page after fixing one of their questions.

Use **Show only items to review** to find flagged questions. After addressing them, check the complete student copy and answer key before printing. An answer key can only show answers that the questions provide, so check it before using it for grading.

## Use multiple forms

If your assessment uses randomization, select **Add form** to create another form. The new form copies the overall settings of the form you are viewing and chooses its own questions and random values. For questions shared by both forms, it also copies which ones you left out and their individual spacing. Newly chosen questions start included with **Automatic** spacing. You can have up to 26 current forms. Their first versions are labeled A1 through Z1, and new forms take the first available letter. Assessments without randomization use a single current form.

Select a form to review it and choose its questions and spacing. Changes to those settings save as you make them, so you can switch forms before updating the preview. Save any changes to **Additional student fields** before switching. Select **Update preview** before downloading a form.

Starting the first PDF or Word download for a form fixes its question selection so later student copies and answer keys can match. To include or exclude a question afterward, select its checkbox and confirm the new numbered version. For example, changing Form B2 creates Form B3 and moves B2 to **Previous forms**. The new version keeps the question order, random values, all other selections, and print settings. You can still change spacing and cover settings on the current form. This also works for an assessment without randomization.

Changing **Paper size** updates all current forms. If a download has started for any affected form, confirm the change to create its next numbered version; the earlier version remains in **Previous forms**. Question selections and other print settings stay with each form. Previous forms keep their saved paper size. If current forms already have different sizes, use the button under **Paper size** to align them before a combined download.

If a form contains questions with variable values, select the circular arrow button beside it, labeled **Regenerate Form A1** (or the corresponding label), to reroll their values. Before starting a download, regeneration keeps the form's label, selected questions, their order, and print settings. To draw a new choice or order of questions, select **Add form**.

After a download starts, regeneration creates a numbered version: A1 becomes A2, then A3. The new version may have a different set or order of questions. It keeps the form's paper size, space per question, and cover settings, but starts with every question in the new form included and returns individual **Spacing** choices to **Automatic**. Review the new student copy and answer key before downloading. The earlier version remains under **Previous forms** with its chosen questions and settings. If a form has no questions with variable values, **Regenerate** appears only after a download starts and creates a new numbered version.

Use the archive button beside a form to remove it from the current set. You can archive a form when at least one other current form remains. If A1 and B1 remain after you archive C1, adding another form creates C2.

Editing question content, assessment instructions, or the honor code can change a later download of an earlier form. Download and keep the matching student copy and answer key for each form. After editing course content, check both again before printing or grading.

## Cover pages

The default cover has spaces for **Name**, **Date**, **Student ID**, and **Section**, along with the assessment's instructions. You can edit or remove **Student ID** and **Section** under **Cover page**:

- Under **Additional student fields**, enter one label per line, such as “Student ID” or “Section”, then select **Save**.
- Select **Include grading table** to add a table for recording question scores.
- Select **Include honor code** to add the assessment's honor code, or the default honor code if the assessment does not have one.
- Uncheck **Include default cover page** if you do not want this cover.

### Add your own cover pages

Use **Custom cover pages (PDF)** to upload your own instructions or other pages for student copies. In each student copy, they appear in the listed order after the default cover and before the questions. If you turn off the default cover, your uploaded pages come first.

You can add up to 10 PDFs, with a combined limit of 100 pages and 10 MB. Uploaded covers are excluded from answer keys and Word files. If you try to close or reload the page before a student-copy PDF containing them is ready, PrairieLearn asks you to confirm leaving. After a reload, you will need to add the files again.

Upload readable PDFs without password protection. If a fillable cover is rejected or its entries do not appear, print it to a new PDF and upload that copy. If an upload is rejected, follow the message or remove the file.

Uploaded covers do not appear in the preview. Download a student-copy PDF to check them before printing.

## Download files

Select **Update preview** after making changes, then open **Download…**. The first four options apply to the form you are previewing:

| Option                                       | What you get                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Download Form A1 (PDF)**                   | One student copy of Form A1, including uploaded cover pages.                                     |
| **Download Form A1 Word (.docx)**            | An editable student copy of Form A1.                                                             |
| **Download Form A1 answer key (PDF)**        | The answer key for Form A1.                                                                      |
| **Download Form A1 answer key Word (.docx)** | An editable answer key for Form A1.                                                              |
| **Download all forms PDF**                   | One student copy of each current form, including uploaded covers. Available with multiple forms. |
| **Download all answer keys PDF**             | One answer key for each current form in a single PDF. Available with multiple forms.             |

For either combined PDF, PrairieLearn adds blank pages when needed so every form or answer key has the same number of pages. The download dialog shows that page count before you start the download.

If a download reports that the preview has expired or changed, select **Update preview** and try again.

Choose Word if you want to make further edits before printing. Formatting and page breaks can differ from the preview and between Word applications, so check the file in the application you plan to use.

Choosing an individual file from **Download…** starts preparing it. For a combined PDF, review the page count in the dialog, then select its download button. PDF and Word files download automatically when ready if you keep this page open. You can start another download while one is being prepared, with up to five in progress for an assessment at a time.

**Recent exports** shows the progress of your ten newest files for this assessment and links to completed files. Forms are shared with course staff, but only the staff member who requested a file can download it. Use the links if you return later or an automatic download is blocked. Each file is available for up to 24 hours after you request it.

### Print copies for a class

Select **Download all forms PDF**. If students are enrolled in the course instance, the dialog tells you how many copies of each form to print to cover the class. The PDF contains one copy of each current form; print the complete file that many times to make an even set of forms. Download the answer keys separately and set them aside before distributing student copies.

Always check the downloaded files before printing, including the cover pages and page breaks for every form.
