# How to allow students to report issues

To allow students to report issues with questions (incorrect answers, unclear wording, etc), set the `"allowIssueReporting": true` property in the `infoAssessment.json` file, or set it to `false` to disallow reporting. This option defaults to `true`.


* Select the assessment from the `Assessments` page.

* Go to the `Files` tab, and click the `Edit` button next to the `infoAssessment.json` file.

* Add the entry:

```json
"allowIssueReporting": true
```

* Click `Save and sync`.

* Navigate back to the Assessments page by clicking `Assessments` from the top bar menu.

When issue reporting is allowed, students see a button labeled "Report an error in this question" and they can submit a short text form. Any course staff can view reported issues from the `Issues` tab on the top bar menu. Course staff with `Editor` or `Owner` permissions can close reported issues.
