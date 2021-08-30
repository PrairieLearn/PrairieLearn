# How to use the question with best score from an assessment zone

Instead of creating a question pool, where individual students get only one of the questions at random, you may want to give the students all the questions, but use only a selection of them towards the score. We will describe two ways to accomplish this:


* Select the assessment from the `Assessments` page.

* Go to the `Files` tab, and click the `Edit` button next to the `infoAssessment.json` file.

1) set `maxPoints` at the zone level:

```json
"zones": [
    {
        "title": "You don't need to complete all questions",
        "questions": [
            {"id": "Question1", "points": [10,8,6,4,2]},
            {"id": "Question2", "points": [10,10,10]},
            {"id": "Question3", "points": [10,5,2]}
        ],
        "maxPoints": 10
    }
]
```

2) use the property `bestQuestions`:

```json
"zones": [
    {
        "title": "You don't need to complete all questions",
        "questions": [
            {"id": "Question1", "points": [10,8,6,4,2]},
            {"id": "Question2", "points": [10,10,10]},
            {"id": "Question3", "points": [10,5,2]}
        ],
        "bestQuestions": 2
    }
]
```

* You must include the `title` property to enable the help description to display next to the title.

* Click `Save and sync`.

* Navigate back to the Assessments page by clicking `Assessments` from the top bar menu.

If a zone has `maxPoints`, then, of the points that are awarded for answering questions in this zone, at most `maxPoints` will count toward the total points. If a zone has `bestQuestions`, then, of the questions in this zone, only `bestQuestions` with the highest number of awarded points will count toward the total points.

The above examples use `"type": "Exam"`, but the same can be accomplished using `"type": "Homework"`.
