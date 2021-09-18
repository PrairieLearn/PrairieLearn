# How to select the assessment set

Each assessment belongs to an *assessment set*, which organize the assessments into different categories, such as "Homework", "Exam", etc.   Check this reference page for a list of the PrairieLearn [standardized assessment sets](../references/course.md#assessment-sets).

To select the assessment set:

* Select the assessment from the `Assessments` page.

* Go to the `Files` tab, and click the `Edit` button next to the `infoAssessment.json` file.

* Modify the `set` property with the desired choice, for example:

```json
"set": "Exam",
```

* Click `Save and sync`.

* Navigate back to the Assessments page by clicking `Assessments` from the top bar menu.

Check this other [documentation to learn how to create new assessment sets](howtoAddAssesmentSet.md).
