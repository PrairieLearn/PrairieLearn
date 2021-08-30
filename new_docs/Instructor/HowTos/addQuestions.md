# How to add questions to an assessment

Use the steps below if you are [creating an assessment](createAssessment.md) for the first time, or if you are updating the access rules from an existing assessment.

* Select the assessment from the `Assessments` page.

* Go to the `Files` tab, and click the `Edit` button next to the `infoAssessment.json` file.

* Modify the `zones` property, for example:

```json
"zones": [
    {
        "questions": [
            {"id": "anEasyQ", "points": 10, "maxPoints": 20},
            {"id": "aSlightlyHarderQ", "points": 15}
        ]
    }
]
```

* Click `Save and sync`.

* Navigate back to the Assessments page by clicking `Assessments` from the top bar menu.

The example above includes two questions to an assessment with  `"type": "Homework"`. Using this configuration, a student can attempt the [same question unlimited times](numberOfAttempts.md) (by default). For question `anEasyQ`, students can obtain a minimum of 10 points for each attempt, and a maximum total points of 20. For question `aSlightlyHarderQ`, since `maxPoints` is by default set to `points`, and hence students can obtain 15 points after the first correct attempt. You can find a detailed description of the scoring system in the [assessment scoring rules](bla) page.

The example below includes the same two questions to an assessment with  `"type": "Exam"`.

```json
"zones": [
    {
        "questions": [
            {"id": "anEasyQ", "points": [20,10,1]},
            {"id": "aSlightlyHarderQ", "points": [20,15,10,5]}
        ]
    }
]
```

Students have 3 attempts to solve question `anEasyQ`, with points decaying as [20,10,1] with each attempt. Students can attempt question `aSlightlyHarderQ` 4 times, with points decaying as [20,15,10,5] in each attempt.
