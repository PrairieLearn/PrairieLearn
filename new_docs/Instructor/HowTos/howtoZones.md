# How to organize assessments with zones

An assessment can be broken down in to a list of zones, to facilitate the organization of questions into topics, level of difficulty, or others.

* Select the assessment from the `Assessments` page.

* Go to the `Files` tab, and click the `Edit` button next to the `infoAssessment.json` file.

* Modify the `zones` property, for example:

```json
"zones": [
    {
        "title": "Easy questions",
        "comment": "These are new questions created for this exam",
        "questions": [
            {"id": "anEasyQ", "points": [5,3,1,0.5,0.25]},
            {"id": "aSlightlyHarderQ", "points": [10,9,7,5]}
        ]
    },
    {
        "title": "Hard questions",
        "comment": "These are questions from last semester",
        "questions": [
            {"id": "hardQV1", "points": [10,8,6,4,2]},
            {"id": "reallyHardQ", "points": [10,10,10,10]}
        ]
    }
]
```

* Click `Save and sync`.

* Navigate back to the Assessments page by clicking `Assessments` from the top bar menu.

Keep in mind:

* Zone `title` is optional and will be displayed to the student if present.
* Zone `comment` is optional and will not be displayed to the student if present.
* Each zone appears in the given order in the assessment.
* Within each zone, the question order is randomized when using `"type": "Exam"`.
