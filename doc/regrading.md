
# Regrading broken questions

Despite all our best efforts, sometimes we put a broken question onto an exam. The recommended procedure for dealing with this situation is:

1. If the error is detected when just a small number of students have taken the exam, correct the question or replace it with a new question. The small number of students who were affected can have their scores adjusted by hand, perhaps with some correction factor for the added challenge they faced by encountering a broken question.

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

1. First update the `infoAssessment.json` file with `"forceMaxPoints"` as described above, and sync this to the live PrairieLearn server.

2. Go to the instructor page for the assessment and click the "Regrade all students" button at the top of the "Assessment instances" box, or use the "Action" menu to regrade a single assessment instance.

Note that `"forceMaxPoints"` on a question only takes affect during a regrade, and has no effect while students are taking an assessment normally. For this reason you should make sure to do a regrade after all students have completed the assessment. Regrading multiple times will not have any negative impact, so it's fine to regrade while some students still need to take the assessment, and then again when all students have finished. Results may be surprising to students if they are regraded while taking their test, so this is best avoided, although there will be no lasting negative effect.
