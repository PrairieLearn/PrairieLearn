
# How to add text to assessment overview page

You may want to provide special instructions for an assessment, or add links to other documents (for example, a cheatsheet).

* Select the assessment from the `Assessments` page.

* Go to the `Files` tab, and click the `Edit` button next to the `infoAssessment.json` file.

* Add the text entry:


```json
"text": "Here you can write special instructions to students."
```

* Click `Save and sync`.

* Navigate back to the Assessments page by clicking `Assessments` from the top bar menu.

To add a link:

```json
"text": "You can use the following link for a summary of mathematical properties that are relevant to this assignment: <a href=https://en.wikiversity.org/wiki/Mathematical_Properties target=_blank>Math properties summary</a>"
```

To add a document saved in `clientFilesCourse`, use:

```
"text": "The following formula sheets are available to you on this exam: <a href=\"<%= clientFilesCourse %>/formulas.pdf\">PDF version</a>"
```

To add a document saved in `clientFilesAssessment`, use:

```json
"text": "The following formula sheets are available to you on this exam: <a href=\"<%= clientFilesAssessment %>/formulas.pdf\">PDF version</a>"
```

Check this other [documentation to learn how to upload files](howtoUploadFiles.md) to `clientFilesAssessment` and `clientFilesCourse`. See [clientFiles and serverFiles](../references/clientServerFiles.md) reference page for more details.

For an implementation, please check this
[assessment](https://www.prairielearn.org/pl/course_instance/128605/assessment/2310475) in the demo course.
