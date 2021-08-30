# How to setup time access


Use the steps below if you are [creating an assessment](createAssessment.md) for the first time, or if you are updating the access rules from an existing assessment.

* From the `Assessments` page, select the assessment you want to modify the access rules.

* Go to the `Files` tab, and click the `Edit` button next to the `infoAssessment.json` file.

* Modify the `allowAccess` property with the appropriate `startDate` and `endDate`, for example:

```json
"allowAccess": [
    {
        "startDate": "2021-01-19T16:00:00",
        "endDate": "2021-05-19T18:00:00",
        "credit": 100,
    }
]
```

* Click `Save and sync`.

* Navigate back to the Assessments page by clicking `Assessments` from the top bar menu.

In the example above, students will be able to complete the assessment for 100% credit during the time interval defined by `startDate` and `endDate`. You can define different time access rules in the same assessment, for example, using multiple credit options or providing different access periods for a group of students.
