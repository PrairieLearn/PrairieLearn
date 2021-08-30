## How to randomize the question ordering

When using assessments with `"type": "Homework"`, the order of the questions is defined by the order in which they appear in the assessment configuration file (`infoAssessment.json`). You can define the additional property  `shuffleQuestions` to randomize the question order.

* Select the assessment from the `Assessments` page.

* Go to the `Files` tab, and click the `Edit` button next to the `infoAssessment.json` file.

* Add a line to define `shuffleQuestions`, for example:


```json
"type": "Homework",
"shuffleQuestions": true,
```

* Click `Save and sync`.

* Navigate back to the Assessments page by clicking `Assessments` from the top bar menu.

There is currently no way to disable question order randomization when using `"type": "Exam"`.
However, one can use [zones](../references/course.md#zones) to control question order.
