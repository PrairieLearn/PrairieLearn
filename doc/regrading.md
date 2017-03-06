
# Regrading broken questions

Despite all our best efforts, sometimes we put a broken question onto an exam. The recommended procedure for dealing with this situation is:

1. If the error is detected when just a small number of students have taken the exam, correct the question or replace it with a new question. Either regrade the broken question with maximum points (see below) or adjust the scores of affected students by hand, perhaps with some correction factor for the added challenge they faced by encountering a broken question.

2. If many students have taken the exam with the broken question then do not attempt to fix it but rather let the exam complete with all students experiencing the same issue. Then afterwards regrade the exam with all students being awarded maximum points for the broken question, as described below.


## Awarding all students maximum points for a question

To regrade an exam and award all students maximum points for a question, edit the [`infoAssessment.json`] file and set `"forceMaxPoints": true` for any broken questions. For example:

```json
"zones": [
    {
        "title": "Easy questions",
        "questions": [
            {"id": "anEasyQ", "points": [10, 5, 3, 1, 0.5, 0.25], "forceMaxPoints": true},
            {"id": "aSlightlyHarderQ", "points": [10, 9, 7, 5]}
        ]
    },
    {
        "title": "Hard questions",
        "questions": [
            {"id": "hardQV1", "points": 10},
            {"id": "reallyHardQ", "points": [10, 10, 10]},
            {
                "numberChoose": 1,
                "points": 5,
                "alternatives": [
                    {"id": "FirstAltQ", "points": 10},
                    {"id": "SecondAltQ", "forceMaxPoints": true}
                ]
            }
        ]
    }
],
```

In the example above the questions `anEasyQ` and `SecondAltQ` will be regraded with maximum points being awarded to any student who has these questions. For questions that all students have this is straightforward. For questions with alternatives it is less clear. For example, consider the case when `SecondAltQ` is broken. We can either award maxinum points to only those students who received `SecondAltQ`, while students with `FirstAltQ` are not regraded, or we could give maximum points to all students irrespective of which alternative they received, as follows:

```json
            {
                "numberChoose": 1,
                "points": 5,
                "forceMaxPoints": true,
                "alternatives": [
                    {"id": "FirstAltQ", "points": 10},
                    {"id": "SecondAltQ"}
                ]
            }
```

Generally it is preferred to take the second approach above and to award maximum points to all students, no matter which alternative question appeared on their particular assessment instance.

## Regrading an assessment

The procedure to regrade an assessment is:

1. First update the `infoAssessment.json` file with `"forceMaxPoints": true` as described above, and sync this to the live PrairieLearn server.

1. Go to the instructor page for the assessment and click the "Regrade all students" button at the top of the "Assessment instances" box, or use the "Action" menu to regrade a single assessment instance.

## Notes on the regrading procedure

1. Once an assessment question has `"forceMaxPoints": true` set, any student who is still doing the assessment will automatically be awarded full points for that question when they grade a submission, irrespective of whether they submitted a correct or incorrect answer. However, the correctness of their answer will still be reported to them so a student might see an "incorrect" submission but receive full points for it. Also, they will not be given points for the question unless they submit an answer.

1. Regrading an assessment multiple times will not have any negative impact. However, after regrading with `"forceMaxPoints": true`, if you later set `"forceMaxPoints": false` and regrade again then the points will not be downgraded back to their old values. That is, once points are awarded they can't be taken away again.

1. It is generally recommended that regrading not be performed while students are currently doing an assessment. There is no danger in doing so, but it might be confusing to students to see their points changing unrelated to their actions.
